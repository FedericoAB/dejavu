---
tipo: plan
ultima_revision: 2026-09-12
---

# Plan — backend (`apps/core`)

Node 22 + TypeScript + Express. Capas del handbook, sin excepciones:

```
src/
├── routes/          define rutas. cero lógica.
├── controllers/     traduce HTTP ↔ dominio, valida con Zod
├── services/        lógica de negocio. no conoce HTTP.
│   ├── normalizer.ts      RawEvent → NormalizedEvent (stepKey)
│   ├── detection.ts       orquesta packages/detector + cooldowns
│   ├── compiler.ts        PatternCandidate → Routine (único que llama al LLM)
│   ├── executor.ts        dispara y sigue corridas
│   ├── watcher.ts         poll de Ambiguous → eventos
│   └── metrics.ts         cálculo de los indicadores
├── repositories/    acceso a datos con Drizzle. no conoce lógica.
├── models/          tipos y entidades
├── trigger/         tareas de Trigger.dev
└── errors/          NotFoundError, ValidationError, ConflictError, UnsupportedStepError
```

**Regla dura:** ningún `req`, `res` ni código HTTP por debajo de `controllers/`.
El detector tiene que poder correr desde un test y desde un cron.

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| `POST` | `/v1/ingest` | Lote de eventos crudos. 202. Responde `{ offer? }` si la detección disparó. |
| `GET` | `/v1/patterns` | Patrones detectados, paginado. |
| `POST` | `/v1/patterns/:id/dismiss` | El usuario dijo que no. Alimenta el cooldown. |
| `POST` | `/v1/patterns/:id/compile` | Candidato → rutina. 201 + `Location`. |
| `GET` | `/v1/routines` · `/v1/routines/:id` | Rutinas. |
| `POST` | `/v1/routines/:id/runs` | Ejecutar. 201 + `Location`. Idempotente por `Idempotency-Key`. |
| `GET` | `/v1/runs/:id` | Estado de la corrida y de cada paso. |
| `GET` | `/v1/runs/:id/stream` | SSE: progreso en vivo para la UI. |
| `POST` | `/v1/runs/:id/approve` | Resuelve el waitpoint de aprobación. |
| `GET` | `/v1/metrics` | Indicadores del tablero. |
| `GET` | `/healthz` | Liveness. |

Convenciones de API del handbook, todas: `/api/v1` con prefijo de versión, plural y
`kebab-case`, jerarquía de un solo nivel, paginación siempre (`{data, meta}`,
límite 50 / máx 200), fechas ISO 8601 UTC, y **un solo formato de error**:

```json
{ "error": { "code": "VALIDATION_FAILED", "message": "...", "details": [], "requestId": "01J8..." } }
```

## El camino caliente: `POST /v1/ingest`

Tiene que responder rápido porque la extensión lo llama cada pocos segundos.

```
1. validar lote (Zod)                        ~0.1 ms
2. normalizar → stepKey                      ~0.1 ms/evento
3. insertar eventos (COPY por lote)           ~2 ms
4. cargar cola de stepKeys del usuario (cache en memoria, últimos 2000)
5. detector.mine(cola)                        ~1 ms
6. si dispara y pasa los cooldowns → crear `offer` y empujarla por SSE
7. 202 Accepted
```

Nada de LLM en este camino. La compilación es asincrónica y ocurre recién cuando
el usuario acepta (o especulativamente, en background, si el score es muy alto).

## DSL de rutinas (`packages/routine-schema`)

Contrato compartido entre core y web, validado con Zod en los dos lados.

```ts
type Routine = {
  id: string
  name: string                     // en castellano, del compilador
  description: string
  params: Param[]
  steps: Step[]
  estimatedManualMs: number        // base del "tiempo ahorrado"
}

type Step = {
  id: string                       // 's1', 's2', ...
  type: StepType
  title: string                    // lo que se muestra en la UI
  input: Record<string, unknown>   // admite plantillas {{ params.x }} / {{ steps.s1.output.y }}
  requiresApproval?: boolean
  unsupported?: { reason: string } // el paso no tiene API: queda manual
}
```

`StepType` de la v1 — seis tipos, elegidos para cubrir el demo entero:

| type | Hace | Conector |
|---|---|---|
| `exa.search` | Busca y trae contenido de la web | Exa |
| `exa.answer` | Pregunta con respuesta citada | Exa |
| `ambiguous.sheets.read` | Lee un rango de una planilla | Ambiguous |
| `ambiguous.docs.create` | Crea un documento con plantilla | Ambiguous |
| `ambiguous.mail.send` | Manda correo **como el agente** (requiere aprobación) | Ambiguous |
| `ambiguous.tasks.complete` | Cierra la tarea | Ambiguous |
| `transform` | Expresión pura sobre las salidas anteriores (sin red) | — |

Agregar un tipo es agregar un archivo en `connectors/steps/` y una entrada en el
registro. Ninguna otra parte del sistema cambia.

## Ejecución

Una corrida es una tarea de Trigger.dev, no un `for` dentro del request.

```ts
// src/trigger/run-routine.ts
export const runRoutine = schemaTask({
  id: 'run-routine',
  schema: z.object({ runId: z.string(), routineId: z.string(), params: z.record(z.unknown()) }),
  retry: { maxAttempts: 1 },            // el reintento es por paso, no por corrida
  run: async ({ runId, routineId, params }) => {
    const routine = await routines.byId(routineId)
    const ctx = { params, steps: {} as Record<string, unknown> }

    for (const step of routine.steps) {
      if (step.unsupported) { await runSteps.skip(runId, step.id); continue }

      if (step.requiresApproval) {
        const token = await wait.createToken({ timeout: '10m' })
        await approvals.request(runId, step, token.id)   // Auth0 CIBA → push al teléfono
        const res = await wait.forToken<{ approved: boolean }>(token)
        if (!res.ok || !res.output.approved) { await runSteps.reject(runId, step.id); break }
      }

      const out = await executeStep(step, ctx, { idempotencyKey: `${runId}:${step.id}` })
      ctx.steps[step.id] = out
      await runSteps.succeed(runId, step.id, out)        // → SSE → la UI tilda el paso
    }
  },
})
```

Por qué Trigger.dev y no un worker propio: `wait.forToken` da la pausa de horas sin
mantener un proceso vivo, los reintentos y la idempotencia vienen resueltos, y la
consola sirve de panel de incidentes durante la demo.

## Reglas de ejecución

- **Todo paso es idempotente**, con clave `${runId}:${stepId}`. Se va a ejecutar dos
  veces alguna vez.
- **Nada de llamadas externas dentro de una transacción abierta.** La transacción
  abre y cierra en el servicio, alrededor de la escritura, nunca alrededor del HTTP.
- Un paso con efecto irreversible (`mail.send`) **siempre** pasa por aprobación en la
  v1, aunque el usuario haya dicho "confío". Se afloja después, con evidencia.
- Timeout por paso: 30 s. Timeout de corrida: 5 min.

## Logging y errores

- JSON estructurado (pino). `requestId` en cada log y devuelto en el error.
- Niveles: `error` (requiere humano) · `warn` (anómalo manejado) · `info` (hitos:
  patrón detectado, oferta aceptada, corrida terminada) · `debug` (solo dev).
- **Nunca se loguea:** valores de eventos sin redactar, tokens, `AMBIGUOUS_API_KEY`,
  cuerpos de correo.
- Errores de dominio como clases; un único middleware traduce a HTTP. El cliente
  nunca ve un stack trace.

## Seguridad

- La extensión se autentica con `CORE_INGEST_TOKEN` (bearer) + origen permitido.
- Autorización por recurso en cada endpoint: una corrida solo la ve su dueño.
  Que el frontend esconda el botón no es control de acceso.
- Consultas parametrizadas siempre (Drizzle lo garantiza).
- `helmet`, límite de 256 KB en el cuerpo, rate limit en `/ingest` (120 req/min) y
  en cualquier paso que mande correo.
- CORS explícito por origen. Nunca `*`.
