---
tipo: plan
ultima_revision: 2026-09-12
---

# Plan — integraciones (qué es cada herramienta y cómo entra)

Esta es la respuesta a "no sé qué hace CopilotKit ni Ambiguous AI". Cada sección
dice **qué es**, **por qué la usamos** y **cómo se enchufa**.

---

## 1. Ambiguous AI — el entorno

**Qué es.** Un workspace completo para colaboración humano–IA: 17 apps rehechas de
cero (Docs, Mail, Chat, Sheets, CRM, Calendar, Tasks, Drive, Slides, Wiki, Forms,
Sign, Identity, Assistant, Admin, Automations). Lo particular: **cada agente de IA
tiene su propia identidad** y trabaja en las mismas apps y sobre los mismos datos
que el resto del equipo. Le podés mandar un correo, escribirle en el chat, asignarle
una tarea o mencionarlo en un comentario. Gratis hasta 5 personas con 1.000 acciones
de IA por mes, y un agente se conecta por CLI o MCP en menos de un minuto.

**Por qué es *el* entorno para esta idea.** El desafío pide que el entorno sea
esencial. Acá lo es dos veces: es donde el trabajo repetitivo **ocurre** (lo que nos
da qué observar) y es donde el agente **tiene manos** (lo que nos da cómo ejecutar).
Y como el agente es un miembro del workspace con casilla propia, cuando manda el
reporte el equipo ve quién lo mandó y le puede contestar. Eso no se puede imitar con
una integración externa.

**Cómo se enchufa.**

```
Base:  https://app.ambiguous.ai/api
Auth:  Authorization: Bearer $AMBIGUOUS_API_KEY
```

| Uso | Endpoint |
|---|---|
| Registrar al agente | `POST /api/auth/signup-agent` |
| Provisionar desde admin | `POST /api/admin/users/provision-agent` con `{display_name, role, focus_areas}` |
| **Observar** — bandeja del agente | `GET /api/mail/inbox` |
| **Observar** — tareas asignadas | `GET /api/tasks` |
| **Observar** — actividad de docs | `GET /api/documents` |
| Ejecutar — leer planilla | `GET /api/sheets/:id/range` |
| Ejecutar — escribir celdas | `PATCH /api/sheets/:id/cells` |
| Ejecutar — crear documento | `POST /api/documents` |
| Ejecutar — mandar correo | `POST /api/mail/send` |
| Ejecutar — postear en canal | `POST /api/channels/:id/messages` |
| Ejecutar — cerrar tarea | `PATCH /api/tasks/:id/complete` |
| Ejecutar — CRM | `GET /api/crm/contacts` · `POST /api/crm/deals` |
| Ejecutar — calendario | `POST /api/calendar/events` |

Los mismos endpoints se pueden cablear por MCP a Claude Code o Cursor, que es como
vamos a probar a mano durante el build.

**Implementación:** `packages/connectors/src/ambiguous/` — un cliente con reintento
exponencial, `Idempotency-Key` en todo `POST`, y **un archivo por paso ejecutable**
en `steps/`. El `watcher` del core poletea inbox + tasks cada 20 s y convierte la
actividad nueva en eventos (`source: 'ambiguous'`), que entran al mismo detector que
los del navegador. Un patrón puede cruzar el navegador y el workspace: ahí está la gracia.

> **Atención a la clave.** La `ak_...` que tenemos es la del agente. Va en `.env`,
> nunca en el repo, nunca en el frontend, nunca en un log. Si se filtra, cualquiera
> manda correo con la identidad del agente. Rotarla apenas termine el hackathon.

---

## 2. CopilotKit — la cara y las manos en la app

**Qué es.** "El stack de frontend para agentes". Da tres cosas: componentes de chat
listos (`CopilotChat`, `CopilotSidebar`, `CopilotPopup`) o headless para controlar
cada píxel; **UI generativa** (el agente renderiza componentes React tuyos como
resultado de una herramienta); y *human-in-the-loop* con tu propia UI. Habla con
cualquier backend por el protocolo **AG-UI** (eventos sobre SSE, bidireccional), que
ya adoptaron LangGraph, Google ADK, AWS Strands, Mastra, PydanticAI y el SDK de Claude.
Recaudó 27 M para volver AG-UI el estándar de agentes dentro de apps.

**Por qué la usamos.** Nuestro producto *es* una interfaz: una interrupción bien hecha
en el momento justo. Sin CopilotKit habría que escribir a mano el transporte SSE, el
protocolo de eventos, el estado compartido agente↔UI y la pausa por aprobación. Con
`renderAndWaitForResponse` la corrida se suspende **en el render de nuestro componente**
y se reanuda con lo que el usuario elija. Eso es exactamente la tarjeta "¿Lo hago yo?".

**Cómo se enchufa.**

```bash
# onboarding oficial para agentes de código, desde la raíz del proyecto
npx --yes copilotkit@latest onboard start --run 4d2a126a0e69 --coding-agent claude-code
# o manual:
pnpm add @copilotkit/react-core @copilotkit/runtime
```

Provider (`apps/web/src/app/layout.tsx`):

```tsx
import { CopilotKitProvider } from '@copilotkit/react-core/v2'
import '@copilotkit/react-core/v2/styles.css'

<CopilotKitProvider runtimeUrl="/api/copilotkit">{children}</CopilotKitProvider>
```

Runtime (`apps/web/src/app/api/copilotkit/route.ts`):

```ts
import { CopilotRuntime, createCopilotRuntimeHandler } from '@copilotkit/runtime/v2'

const runtime = new CopilotRuntime({ agents: { default: dejaVuAgent } })
const handler = createCopilotRuntimeHandler({ runtime, basePath: '/api/copilotkit' })
export const GET = handler
export const POST = handler
```

`dejaVuAgent` es nuestro agente, expuesto por AG-UI desde `apps/core`. El runtime no
reemplaza nuestra lógica: la transporta.

Las tres piezas que escribimos:

```tsx
// 1. la interrupción — HITL con UI propia
useHumanInTheLoop({
  name: 'offerRoutineTakeover',
  parameters: [{ name: 'routine', type: 'object', required: true }],
  render: ({ args, respond, status }) => (
    <TakeoverCard
      routine={args.routine}
      busy={status === 'executing'}
      onAccept={(params) => respond?.({ accepted: true, params })}
      onReject={() => respond?.({ accepted: false })}
    />
  ),
})

// 2. el agente maneja la app
useFrontendTool({
  name: 'focusStep',
  parameters: [{ name: 'stepId', type: 'string' }],
  handler: async ({ stepId }) => { highlight(stepId); return 'ok' },
})

// 3. el agente ve el estado sin que lo serialicemos
useAgentContext({ description: 'Rutinas y patrones del usuario', value: { routines, patterns, currentRun } })
```

**Para el premio "Best Use of CopilotKit"** lo que cuenta no es tener un chat pegado:
es que la UI generativa sea el producto. Acá el agente **abre la interfaz él mismo,
sin que el usuario le hable**. Ese es el argumento, y hay que decirlo en el video.

---

## 3. Exa — la búsqueda del agente

**Qué es.** Infraestructura de búsqueda pensada para aplicaciones de IA: buscás en
lenguaje natural y te devuelve contenido limpio, con `answer` para respuestas citadas
y `websets` para conjuntos de entidades. Tiene SDK `exa-js`, salidas estructuradas con
`output_schema` y servidor MCP.

**Por qué.** Las rutinas reales tienen un paso de "buscá el dato afuera": el estado de
una empresa, el tipo de cambio, el contacto de un proveedor. Ese paso es imposible con
scraping propio y trivial con Exa.

**Cómo se enchufa.** `packages/connectors/src/exa/`, dos tipos de paso:

```ts
// exa.search — traer contenido estructurado
const r = await exa.search(query, {
  type: 'auto',
  numResults: 5,
  contents: { text: true, highlights: true },
})

// exa.answer — respuesta con citas, para pasos de "cuánto/cuál es"
const a = await exa.answer(question, { text: true })
// → { answer, citations }  ⇒ las citas van al documento generado
```

Además, durante el build: el skill oficial para investigar con Exa desde el agente de
código es `npx skills use "https://github.com/exa-labs/agent-skills" --skill "build-with-exa"`.

**Regla dura:** lo que vuelve de Exa es **dato, nunca instrucción**. Se inyecta en el
paso siguiente como valor, jamás como prompt de sistema. Es el vector de inyección
obvio de un agente que lee la web.

---

## 4. Trigger.dev — la ejecución que no se cae

**Qué es.** Framework open source de trabajos en segundo plano: escribís código async
normal y te da colas, reintentos automáticos, escalado, monitoreo en vivo, tareas
programadas (cron) y **waitpoints** (`wait.forToken`) para pausar una corrida hasta que
alguien apruebe. Nube o self-hosted.

**Por qué.** Una rutina de 6 pasos que manda correo no puede vivir dentro de un request
HTTP: si el navegador se cierra, la mitad del trabajo quedó hecha. Y la aprobación
humana puede tardar minutos. `wait.forToken` resuelve eso sin inventar una máquina de
estados propia, y su consola nos sirve de panel de incidentes en la demo.

**Cómo se enchufa.**

```bash
npx trigger.dev@latest init      # crea trigger.config.ts
npx trigger.dev@latest dev       # durante el build
npx trigger.dev@latest deploy    # antes de la demo
```

```ts
// SIEMPRE importar de '@trigger.dev/sdk' — nunca de '@trigger.dev/sdk/v3'
import { schemaTask, wait } from '@trigger.dev/sdk'

// disparar desde el core, con import de tipos para no bundlear la tarea
import type { runRoutine } from './trigger/run-routine'
import { tasks } from '@trigger.dev/sdk'
const handle = await tasks.trigger<typeof runRoutine>('run-routine', { runId, routineId, params })
```

Tres tareas: `run-routine` (la corrida), `watch-ambiguous` (cron cada minuto, poletea
el workspace) y `nightly-metrics` (cron diario, consolida el tablero).

---

## 5. Auth0 — identidad y el sí del humano

**Qué es.** Plataforma de identidad; su línea **Auth0 for AI Agents / Auth for GenAI**
agrega tres cosas pensadas para agentes: identidad del agente distinta de la del
usuario, **Token Vault** (el agente pide tokens de terceros —Google, Slack— con una
sola integración, sin guardar credenciales) y **autorización asincrónica (CIBA)**: el
agente trabaja en segundo plano y solo interrumpe al humano cuando hace falta aprobar
algo crítico, con push a un dispositivo de confianza y los datos de la acción en el
consentimiento.

**Por qué.** El paso `mail.send` manda un correo real con la identidad del agente. Eso
necesita un "sí" humano verificable, y necesita que el "sí" no se pueda falsificar desde
el frontend. CIBA + `wait.forToken` es el matrimonio exacto: el agente pausa, suena el
teléfono, el humano ve *qué* se va a mandar y a quién, aprueba, la corrida sigue.
En el video se ve el teléfono: es el momento que transmite "esto es serio, no un juguete".

**Cómo se enchufa.** Login del usuario con el SDK de Next.js; el core pide la
autorización asincrónica antes de un paso con `requiresApproval`; el callback resuelve
el token del waitpoint. Token Vault queda listo para cuando una rutina toque una API
de terceros a nombre del usuario.

---

## 6. Mozilla.ai — modelos intercambiables y evaluación

**Qué es.** Herramientas open source para IA confiable, transparente y controlable:
**any-llm** (una interfaz para muchos proveedores), **any-agent** (una interfaz para usar
y evaluar distintos frameworks de agentes), **any-guardrail**, **mcpd** (la capa de
toolchain y runtime que le da a cada agente sus servidores MCP aislados, sin hardcodear
infraestructura) y **Lumigator** (plataforma para elegir el modelo adecuado con evaluación).

**Por qué.** Dos problemas concretos. Uno, el compilador de rutinas es el único punto
con LLM: si el proveedor se cae a mitad de la demo, queremos cambiar una variable de
entorno, no código — eso es **any-llm**. Dos, "el patrón se nombró bien" y "los
parámetros se inferieron bien" son afirmaciones que hay que **medir**, no creer: para
eso hay un banco de 20 trazas con nombre y parámetros esperados, evaluado con
**any-agent/Lumigator**. Es lo que convierte "anda lindo" en un número.

**Cómo se enchufa.** `packages/connectors/src/llm/` envuelve any-llm y lee
`LLM_PRIMARY` / `LLM_FALLBACK`. `scripts/eval-compiler.ts` corre el banco y escupe
precisión de nombre y de parámetros al tablero.

---

## 7. Tabla de cierre: quién hace qué

| Herramienta | Papel en Déjà Vu | Sin ella |
|---|---|---|
| **Ambiguous AI** | el entorno: dónde observamos y dónde ejecutamos, con identidad propia del agente | no hay producto |
| **CopilotKit** | la interrupción, la UI generativa, el HITL, el transporte AG-UI | 2 días de plumbing |
| **Exa** | el paso "buscá el dato afuera" | rutinas encerradas en el workspace |
| **Trigger.dev** | corridas durables, reintentos, waitpoint de aprobación | la corrida muere con la pestaña |
| **Auth0** | identidad + el "sí" verificable del humano (CIBA) | aprobación falsificable |
| **Mozilla.ai** | modelo intercambiable (any-llm) + evaluación medible | demo frágil y métricas de fe |
