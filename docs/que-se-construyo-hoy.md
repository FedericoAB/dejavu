---
tipo: plan
ultima_revision: 2026-09-12
---

# Qué se construyó hoy

Requisito de elegibilidad: el proyecto y su funcionalidad principal tienen que
haberse construido durante el evento, y hay que poder explicar qué parte es de hoy.
Este archivo se actualiza **cada hora**. Es más fácil escribirlo al pasar que
reconstruirlo a las 19:00.

## Construido hoy, desde cero

| Hora | Qué | Dónde |
|---|---|---|
| 09:40 | Investigación de las APIs de los sponsors y decisión de arquitectura | `docs/plan-integraciones.md`, 6 ADRs |
| 10:20 | **Motor de detección de patrones completo**: normalización semántica, minería de subsecuencias con hash rodante, puntaje, extracción de parámetros y enlaces de datos | `packages/detector/src/` |
| 10:26 | 15 tests unitarios en verde | `packages/detector/test/detector.test.ts` |
| 10:30 | Banco etiquetado de 20 trazas, F1 = 1,00 | `packages/detector/test/eval.ts` |
| 10:35 | Los nueve documentos de plan | `docs/` |

## Bloques preexistentes usados (permitido, y hay que poder declararlo)

| Bloque | Qué aporta | Qué escribimos nosotros |
|---|---|---|
| CopilotKit | componentes de chat, transporte AG-UI, hooks de HITL | la tarjeta de interrupción, las tools, el contexto del agente |
| Trigger.dev | cola, reintentos, waitpoints | la tarea `run-routine` y los pasos |
| SDK de Exa | cliente HTTP | los dos tipos de paso y el manejo de citas |
| SDK de Auth0 | login y CIBA | el puente entre CIBA y el waitpoint |
| any-llm (Mozilla.ai) | abstracción de proveedor | el compilador de rutinas y su prompt |
| Next.js, Express, Drizzle, Zod, vitest | andamiaje | todo el dominio |

**Nada de este proyecto existía antes de hoy.** No hay código reutilizado de un
proyecto propio anterior: el historial de git arranca hoy y se puede auditar commit
por commit.

## La frase para el jurado

> "Lo que construimos hoy es el motor de detección y el sistema que lo rodea. Las
> librerías de los sponsors nos dieron el transporte, la cola y la identidad; el
> algoritmo que decide *cuándo* el agente puede ayudar es nuestro, y está testeado."
