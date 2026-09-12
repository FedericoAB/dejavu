---
tipo: plan
ultima_revision: 2026-09-12
---

# Plan del día

Premisa: el alcance es lo único negociable. La hora de la demo no se mueve.

## Orden de construcción (por dependencia, no por gusto)

```
1. routine-schema  ──►  sin el contrato, web y core divergen y se pierde una hora
2. detector        ──►  es el corazón y no depende de NADA: se puede hacer y testear primero
3. db + core/ingest──►  eventos entrando de verdad
4. observer        ──►  eventos reales del navegador
5. connectors      ──►  Ambiguous primero (es el entorno), Exa después
6. executor        ──►  Trigger.dev, primero sin aprobación
7. web             ──►  CopilotKit, la interrupción, el timeline
8. aprobación      ──►  Auth0 CIBA (lo primero que se corta si falta tiempo)
9. métricas        ──►  el tablero
10. video
```

## Cronograma

| Hora | Frente A (core/detección) | Frente B (web/UX) | Frente C (integraciones) |
|---|---|---|---|
| 09:00 | `routine-schema` + tipos | Next.js + tokens SCSS + shared/ | claves: Ambiguous, Exa, Trigger, Auth0 |
| 10:00 | **detector con tests** | `TakeoverCard` estática con datos falsos | cliente Ambiguous: leer inbox y tasks |
| 11:00 | migraciones + `/v1/ingest` | CopilotKit provider + runtime | `ambiguous.mail.send` + `docs.create` |
| 12:00 | detección en vivo + cooldowns | `useHumanInTheLoop` cableado | `exa.search` + `exa.answer` |
| 13:00 | **checkpoint** — eventos reales entrando | | |
| 14:00 | compilador (LLM) | timeline de corrida por SSE | tarea `run-routine` en Trigger.dev |
| 15:00 | **checkpoint** — corrida end-to-end | cuatro estados de UI | `watch-ambiguous` cron |
| 16:00 | métricas + `/v1/metrics` | tablero `/metrics` | Auth0 CIBA |
| 17:00 | endurecer: reintentos, errores | pulido: copy, animación, foco | ensayo del guion |
| 17:30 | **CONGELAMIENTO. Se ensaya.** | | |
| 18:00 | grabar video (3 tomas máximo) | | |
| 19:00 | README, descripción, post, submit | | |

Si se trabaja solo, se hace la columna A completa y de la B solo `TakeoverCard` +
timeline; el tablero pasa a ser una consulta SQL mostrada en pantalla.

## Cortes de alcance (en este orden, sin discusión)

1. Tablero de métricas bonito → una tabla simple con los mismos números.
2. Auth0 CIBA → aprobación con un botón en la propia UI (el HITL se mantiene, cambia
   el canal). **El HITL nunca se corta**: es medio producto.
3. Watcher de Ambiguous → solo eventos del navegador. Pero entonces hay que ejecutar
   igual contra Ambiguous, porque el entorno es el argumento.
4. Compilador con LLM → plantillas de rutina fijas mapeadas por tipo de paso. La
   detección sigue siendo real, que es lo que se muestra.
5. Extensión de Chrome → una página de "trabajo simulado" instrumentada que emite los
   mismos eventos. **Último recurso**: se pierde credibilidad, pero no la demo.

Lo que **nunca** se corta: detección determinista con tests, ejecución real contra
Ambiguous, y la interrupción sin prompt.

## Riesgos y su plan B

| Riesgo | Probabilidad | Plan B |
|---|---|---|
| API de Ambiguous distinta a la documentada | media | Explorar con `curl`/MCP en la primera hora, antes de escribir el conector. Si algo falta, el paso se marca `unsupported` y la UI lo dice. |
| La extensión no captura lo que esperamos | media | La página instrumentada (corte 5) ya emite el mismo formato de evento: cambiar la fuente es cambiar un origen. |
| CopilotKit v2 con API distinta a la del doc | media | `npx copilotkit onboard` genera instrucciones actualizadas. Fallback: `CopilotChat` clásico + nuestro propio componente de interrupción (que no necesita CopilotKit para renderizarse). |
| El modelo se cae | baja | `LLM_FALLBACK` por variable de entorno (any-llm). |
| Rate limit de Ambiguous (1.000 acciones/mes) | media | Cachear las lecturas del watcher, poletear cada 60 s en vez de 20 s, y **no ensayar la demo más de 5 veces** con envío real. |
| Demo en vivo se cae frente al jurado | media | Video grabado + `pnpm test` en verde + el tablero con datos de las corridas anteriores. Se presenta en ese orden. |

## Definición de terminado (por pieza)

Una pieza no está lista hasta que: tiene sus cuatro estados de UI (si es vista), su
error de dominio traducido a HTTP (si es endpoint), su test (si es lógica pura), y
alguien distinto al que la escribió la vio funcionar.
