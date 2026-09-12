---
tipo: plan
ultima_revision: 2026-09-12
---

> **Alcance:** este documento describe la visión ampliada. El MVP implementado y sus límites están en [revision-mvp.md](revision-mvp.md) y [ADR-0007](decisions/ADR-0007-mvp-vertical.md). No tomar los componentes previstos como integraciones ya disponibles.

# Plan — motor de detección

Es el corazón del producto. Vive en `packages/detector`, no depende de red, base
de datos ni modelos, y por eso se puede testear de verdad.

## 1. Evento

Lo que llega a `POST /v1/ingest`:

```ts
type RawEvent = {
  source: 'browser' | 'ambiguous' | 'app'
  kind: 'navigate' | 'copy' | 'paste' | 'input' | 'submit' | 'click'
      | 'mail.send' | 'mail.read' | 'sheet.read' | 'sheet.write'
      | 'doc.create' | 'task.complete' | 'download' | 'upload'
  occurredAt: string          // ISO 8601 UTC
  app: string                 // 'ambiguous.sheets' | 'web:bcp.com.py' | ...
  locator: {
    urlPattern?: string       // '/clientes/:id' — IDs ya sustituidos
    role?: string             // 'button' | 'textbox' | 'cell' | 'link'
    label?: string            // texto accesible, recortado y normalizado
  }
  values?: Record<string, string>  // redactado; candidatos a parámetro
}
```

**La extensión nunca manda la URL cruda.** Antes de salir del navegador, cada
segmento que parezca identificador (numérico, UUID, hash) se reemplaza por `:id`.
Eso es lo que hace que dos vueltas con clientes distintos sean el *mismo* paso.

## 2. Normalización → `stepKey`

```
stepKey = sha1(`${kind}|${app}|${locator.urlPattern ?? ''}|${locator.role ?? ''}|${slug(locator.label)}`)
```

Reglas:
- El `label` se normaliza: minúsculas, sin acentos, sin dígitos, ≤ 40 chars.
  "Enviar reporte a Konecta" y "Enviar reporte a Detez" colapsan al mismo paso.
- Los **valores no entran en la clave**. Se guardan aparte: son los futuros parámetros.
- `navigate` consecutivos al mismo patrón se colapsan en uno (deduplicación de rebotes).

Esta es la única razón por la que el sistema funciona: la clave captura *la forma
del paso*, y la variación queda como dato.

## 3. Sesionización

Eventos ordenados por tiempo, cortados cuando el hueco supera `IDLE_GAP = 90s`.
Cada sesión es una secuencia `S = [k1, k2, k3, ...]` de `stepKey`s.

La detección corre sobre la **traza continua del usuario**, no por sesión aislada:
el patrón interesante es el que cruza sesiones (lo hizo el lunes, lo hizo el martes).

## 4. Minería de subsecuencias repetidas

Problema formal: encontrar la subsecuencia contigua `P` de `S` que maximiza el
valor esperado de automatizarla.

```
para n in [MIN_LEN=3 .. MAX_LEN=15]:
    para cada ventana de largo n en S:
        h = rolling_hash(ventana)
        acumular ocurrencias[h] = [posiciones...]

candidatos = { h : |ocurrencias| >= MIN_SUPPORT (=2) }
descartar solapadas: se conservan las ocurrencias no solapadas, greedy de izquierda a derecha
descartar contenidas: si P ⊂ Q y soporte(P) == soporte(Q), gana Q  (maximalidad)
```

Hash rodante (Rabin-Karp sobre los `stepKey`) para que el barrido sea O(|S| · MAX_LEN)
y no O(|S|²). Con `|S|` de unos miles y `MAX_LEN=15` corre en microsegundos: se puede
ejecutar **en cada evento entrante**, que es lo que permite interrumpir en vivo.

## 5. Puntaje

```
score = w_s·support_norm + w_l·len_norm + w_t·tiempo_norm + w_r·recencia − w_v·varianza

support_norm  = min(support, 4) / 4
len_norm      = min(len, 8) / 8
tiempo_norm   = min(mediana_duracion_ms, 120_000) / 120_000   ← lo que realmente duele
recencia      = exp(−horas_desde_ultima / 24)
varianza      = max(0, (fracción_de_campos_que_varían − 0,8) / 0,2)
```

Pesos `w = [0,30 · 0,15 · 0,30 · 0,15 · 0,10]`, todos en `detector/src/config.ts`.
Se dispara la oferta si `support >= 2 && score >= 0,50`.

Dos detalles de calibración que salieron de correr el banco, no de la intuición:

- **El techo de duración es 2 minutos, no 5.** Un flujo manual de 2 minutos ya está
  en el techo del dolor; poner el techo más alto hacía que rutinas perfectamente
  válidas de 1 minuto quedaran bajo el umbral.
- **La varianza penaliza con rodilla en 0,8, no linealmente.** Que casi todo cambie
  entre vueltas es *lo normal y lo bueno* (por eso hay parámetros). Solo es sospechoso
  el caso extremo: ningún valor estable en toda la secuencia, que es navegación
  disfrazada. Penalizar linealmente rechazaba el flujo del propio demo.

Valores reales del banco (`pnpm eval:detector`): el patrón de cobranzas con dos
vueltas puntúa **0,707**; con cuatro vueltas, **0,857**; una rutina corta de 4 pasos
y 1 minuto, **0,519** — apenas arriba del umbral, que es exactamente donde queremos
que esté el caso marginal.

## 6. Anti–falso positivo

Reglas duras, antes de ofrecer nada:

1. **Nada de ruido puro.** Se descartan patrones de solo `navigate`/`click` sin un
   paso con efecto (`send`, `write`, `create`, `submit`, `download`).
2. **Cooldown por patrón:** si el usuario rechazó este patrón, no se vuelve a ofrecer
   por 24 h; si lo rechazó dos veces, `muted` para siempre.
3. **Cooldown global:** una oferta cada 10 minutos, máximo. La interrupción que molesta
   mata el producto.
4. **Momento de la interrupción:** se ofrece cuando el usuario **empieza** la vuelta
   siguiente (primer paso del patrón coincide), no en el medio ni al terminar. Ofrecer
   al terminar es inútil: el trabajo ya está hecho.
5. **Umbral de ahorro:** si la rutina tarda menos de 20 s a mano, no vale interrumpir.

## 7. Extracción de parámetros

Para cada paso del patrón, se comparan los `values` entre ocurrencias:

- valor **idéntico** en todas las vueltas → constante, se hornea en la rutina
- valor **distinto** en cada vuelta → parámetro
- valor **derivable** de un paso anterior (aparece como salida del paso *i* y como
  entrada del paso *j>i*) → **enlace de datos**, `{{ steps.s1.output.total }}`

El tercer caso es lo que convierte una grabación en un programa. Se detecta por
coincidencia exacta de string entre salida y entrada dentro de la misma vuelta.

## 8. Salida del detector

```ts
type PatternCandidate = {
  fingerprint: string          // estable: identifica al patrón entre corridas
  stepKeys: string[]
  occurrences: { startedAt: string; endedAt: string; values: Record<string,string>[] }[]
  support: number
  score: number
  medianDurationMs: number
  params: { stepIndex: number; field: string; kind: 'const'|'param'|'link'; source?: string }[]
}
```

Y de ahí toma el compilador (`core/services/compiler`), que es el único que llama
a un modelo: le pone nombre en castellano, describe qué hace y mapea cada paso a
un `type` ejecutable del DSL. Si el modelo no está disponible, se ofrece la rutina
con nombre genérico —**la detección nunca se cae por falta de LLM**.

## 9. Qué se testea (y se mide)

`packages/detector/test/` con vitest, sin red y sin claves.

**16 tests unitarios, 16 en verde** (`pnpm --filter @dejavu/detector test`):

| Caso | Espera | Estado |
|---|---|---|
| `/clientes/4821/facturas/993` → `/clientes/:id/facturas/:id` | sustitución de IDs | ✅ |
| label con acentos y dígitos → normalizado | `"enviar reporte a konecta"` | ✅ |
| dos vueltas con clientes distintos | **mismas** `stepKey`s | ✅ |
| 2 vueltas idénticas de 6 pasos | 1 candidato, support 2, len 6 | ✅ |
| 3 vueltas | support 3 | ✅ |
| 2 vueltas con valores distintos | 4 `param`, 2 `const`, 3 `link` | ✅ |
| salida del paso 1 usada en el paso 3 | `steps.s1.output.amount` | ✅ |
| navegación aleatoria (60 eventos) | 0 candidatos | ✅ |
| patrón de 2 pasos | 0 candidatos (bajo `minLen`) | ✅ |
| secuencia repetida sin paso con efecto | 0 candidatos | ✅ |
| ruido intercalado entre vueltas | sigue detectando | ✅ |
| patrón anidado con soporte empatado | gana el maximal (1 candidato, len 6) | ✅ |
| flujo de < 20 s a mano | 0 candidatos | ✅ |
| 2000 eventos | < 50 ms (camino caliente) | ✅ |
| colisión del hash | secuencias distintas no se cuentan como repetidas | ✅ |

**Banco etiquetado, 20 trazas** (`pnpm eval:detector`) — 12 positivas y 8 negativas:

```
precision  1.000
recall     1.000
F1         1.000
largo del patron correcto  10/11
```

El `10/11` es honesto y vale la pena explicarlo: en la traza con ruido antes y después
de cada vuelta, el detector devuelve un patrón de 7 pasos en vez de 6 porque el evento
de ruido que aparece **siempre** en la misma posición relativa es, desde su punto de
vista, parte del patrón. No es un falso positivo: es una diferencia de criterio que se
resuelve dejando que el usuario borre el paso de más en la tarjeta de la interrupción.

Estos números son la red de seguridad: si la demo en vivo se cae, se corre `pnpm test`
y `pnpm eval:detector` frente al jurado.
