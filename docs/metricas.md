---
tipo: plan
ultima_revision: 2026-09-12
---

# Sistema de métricas

Dos capas distintas, y no hay que confundirlas:

1. **Métricas de producto** — mide el sistema, se ven en `/metrics`, van en el video.
2. **Scorecard del hackathon** — mide el *equipo*, dice si estamos en condiciones de
   ganar. Se revisa cada 2 horas.

---

## Capa 1 — métricas de producto

Todo se registra como `metric_events` con nombre estable. Nada se calcula "a ojo".

### Eventos instrumentados

| Nombre | Cuándo | Props |
|---|---|---|
| `pattern.detected` | el detector supera el umbral | `fingerprint, support, score, len` |
| `offer.shown` | la tarjeta aparece en pantalla | `patternId, latencyMs` |
| `offer.accepted` | el usuario aprieta "Sí" | `patternId, decisionMs` |
| `offer.dismissed` | "No" o expiración | `patternId, reason` |
| `run.started` | arranca la corrida | `runId, routineId, source` |
| `step.succeeded` / `step.failed` | por paso | `stepType, durationMs, attempt` |
| `approval.requested` / `approval.granted` | waitpoint | `runId, waitMs` |
| `run.finished` | termina | `status, durationMs, stepsDone, stepsTotal` |
| `compile.evaluated` | banco de evaluación | `nameOk, paramsF1` |

### Indicadores del tablero

| Indicador | Fórmula | Objetivo del día | Por qué importa |
|---|---|---|---|
| **Tiempo ahorrado** | `Σ (estimated_manual_ms − run_duration_ms)` de corridas exitosas | > 5 min acumulados | es el titular del video |
| **Precisión de la oferta** | `offer.accepted / offer.shown` | ≥ 0,66 (2 de 3) | mide si el agente no molesta |
| **Latencia de detección** | `offer.shown.ts − último evento del patrón` | < 2 s (p95) | una oferta tardía es basura |
| **Tasa de éxito de pasos** | `step.succeeded / (succeeded+failed)` | ≥ 0,95 | mide si ejecuta de verdad |
| **Corridas completas** | `run.finished[status=succeeded]` | ≥ 3 | prueba de que no es un mockup |
| **Cobertura automatizada** | `stepsDone / stepsTotal` | ≥ 0,90 | cuánto del flujo se come |
| **Latencia de aprobación** | mediana de `approval.granted.waitMs` | < 20 s | que el HITL no arruine el ritmo |
| **Falsos positivos** | `offer.dismissed[reason=irrelevant] / offer.shown` | ≤ 0,20 | el riesgo real del producto |
| **Precisión del compilador** | del banco: `nameOk` y F1 de parámetros | ≥ 0,80 | que el LLM no invente |

### Cómo se mide sin trampa

- El **baseline manual** (`estimated_manual_ms`) no lo estima nadie: sale de la mediana
  medida en las ocurrencias reales que el detector ya vio. Es el propio usuario haciéndolo.
- La **precisión de detección** se mide contra un banco etiquetado a mano
  (`packages/detector/test/fixtures/`): 12 trazas positivas y 8 negativas. `pnpm eval:detector`
  imprime precisión, recall y F1. **Este número es el que hay que poder decir en voz alta.**
- Los tests del detector corren sin red y sin claves: si la demo en vivo falla, el
  jurado ve `pnpm test` en verde y el número igual.

### Regla de honestidad

Si un indicador no se puede medir hoy, **se muestra vacío, no inventado**. Un tablero
con números inventados es el error más caro que se puede cometer frente a un jurado
técnico: preguntan cómo se calcula y se termina la conversación.

---

## Capa 2 — scorecard del hackathon

Criterios de elegibilidad y de premio, con evidencia concreta. Se revisa a las
11:00, 13:00, 15:00, 17:00 y 19:00.

### Obligatorio (si falta uno, no hay premio)

| # | Requisito | Evidencia | Estado |
|---|---|---|---|
| 1 | Prototipo funcionando, demostrable el mismo día | demo en vivo + `pnpm test` verde | ☐ |
| 2 | Build net-new durante el evento | historial de git desde hoy 00:00; `docs/que-se-construyo-hoy.md` | ☐ |
| 3 | Título del proyecto | "Déjà Vu — el agente que mira cómo trabajás" | ☑ |
| 4 | Descripción escrita | `docs/submission.md` | ☐ |
| 5 | Repositorio GitHub **público** | este repo, pusheado | ☐ |
| 6 | Video de 2 minutos | guion en `docs/vision.md#el-demo-asesino` | ☐ |
| 7 | Post en redes etiquetando a los partners | borrador en `docs/submission.md` | ☐ |
| 8 | El entorno es esencial a la experiencia | `docs/vision.md#por-qué-el-entorno-es-esencial` | ☑ |
| 9 | Poder explicar qué se construyó hoy | `docs/que-se-construyo-hoy.md` actualizado por hora | ☐ |

### Premios por herramienta

| Premio | Qué mira el jurado | Nuestro argumento | Estado |
|---|---|---|---|
| **Best Use of Ambiguous AI** | que el workspace sea el entorno, no una integración | el agente tiene identidad propia, recibe tareas y manda el reporte desde su casilla; observa **y** ejecuta en las mismas apps que el equipo | ☐ |
| **Best Use of CopilotKit** | uso real de UI generativa y HITL, no un chat pegado | el agente **abre la UI solo, sin prompt**: `useHumanInTheLoop` para la interrupción, `useFrontendTool` para manejar la app, `useAgentContext` para el estado | ☐ |
| Global (Exa) | uso sustantivo de búsqueda | `exa.search` y `exa.answer` son pasos de primera clase del DSL, con citas en el documento generado | ☐ |
| Global (general) | prototipo real + narrativa | tablero de métricas con números medidos | ☐ |

### Objetivos cuantitativos del día

| Hora | Hito | Verificable con |
|---|---|---|
| 11:00 | detector detecta patrón en traza sintética | `pnpm test` |
| 13:00 | ingesta real desde la extensión, eventos en la base | `select count(*) from events` |
| 15:00 | primera corrida end-to-end sin aprobación | `/runs/:id` en verde |
| 16:30 | aprobación por Auth0 funcionando | push recibido |
| 17:30 | **demo completa ensayada una vez** | cronómetro < 2:00 |
| 18:30 | video grabado | archivo |
| 19:00 | submission enviada | portal |

El corte es a las 17:30: **lo que no está a esa hora, no entra**. Ver
`docs/plan-dia.md#cortes-de-alcance`.
