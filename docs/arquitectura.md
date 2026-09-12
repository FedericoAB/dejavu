---
tipo: plan
ultima_revision: 2026-09-12
---

# Arquitectura

## Vista de conjunto

```
   ┌────────────────────┐        ┌─────────────────────┐
   │  Ambiguous AI      │        │  Navegador          │
   │  Mail Chat Docs    │        │  (extensión MV3)    │
   │  Sheets Tasks CRM  │        │                     │
   └─────┬────────▲─────┘        └──────────┬──────────┘
  poll   │        │ actúa                   │ eventos semánticos
  (watch)│        │ (REST)                  │ (POST /ingest)
         ▼        │                         ▼
   ┌──────────────┴─────────────────────────────────────┐
   │  apps/core  —  Node/TS (Express)                   │
   │                                                    │
   │  routes → controllers → services → repositories    │
   │                                                    │
   │  ingest ──► normalize ──► packages/detector        │
   │                               │  (puro, sin red)   │
   │                               ▼                    │
   │                          candidate                 │
   │                               │                    │
   │                        compiler (LLM)              │
   │                               ▼                    │
   │                     Routine (routine-schema)        │
   │                               │                    │
   │                          executor ──► Trigger.dev  │
   └───────┬────────────────────────┬───────────────────┘
           │ SSE / AG-UI            │ pasos
           ▼                        ▼
   ┌────────────────────┐   ┌───────────────────────────┐
   │ apps/web           │   │ packages/connectors        │
   │ Next.js+CopilotKit │   │ Ambiguous · Exa · Auth0    │
   │ interrupción · chat│   │ any-llm (Mozilla.ai)       │
   │ tablero /metrics   │   └───────────────────────────┘
   └────────────────────┘
           ▲
           │ Postgres  (eventos · patrones · rutinas · corridas · métricas)
```

## Los cinco movimientos

| # | Movimiento | Dónde | Determinista |
|---|---|---|---|
| 1 | **Observar** — capturar acciones con forma, no contenido | `apps/observer`, watcher de Ambiguous | sí |
| 2 | **Normalizar** — cada acción a un `stepKey` estable + parámetros | `core/services/normalizer` | sí |
| 3 | **Detectar** — subsecuencia repetida con soporte ≥ 2 | `packages/detector` | **sí** |
| 4 | **Compilar** — candidato → rutina ejecutable y parametrizada | `core/services/compiler` (LLM) | no |
| 5 | **Ejecutar** — correr la rutina, durable, con aprobación | Trigger.dev + `connectors` | sí |

La decisión arquitectónica central: **el LLM no decide si hay un patrón.**
Eso lo hace un algoritmo determinista y testeable. El LLM solo le pone nombre,
infiere los parámetros y arma el plan. Consecuencias:

- La demo no depende del humor del modelo. Repetí el flujo dos veces y dispara. Siempre.
- La precisión de detección es una métrica medible, no una impresión.
- Funciona sin red y sin claves en los tests (`packages/detector` no importa nada).

## Límites del sistema

- **No ejecuta por simulación de UI.** Un paso solo existe si hay una API detrás
  (`packages/connectors`). Si el patrón toca un sitio sin API, el paso se marca
  `unsupported` y la rutina se ofrece igual, parcial y avisando cuál paso queda manual.
- **Un workspace, un usuario observado** en esta versión.
- **La ejecución es al pie de la letra.** El agente no improvisa pasos nuevos
  durante una corrida; si un paso falla, reintenta y si no, para y avisa.

## Flujo de datos y confianza

| Dato | Origen | Dónde vive | Se le cree |
|---|---|---|---|
| Evento de navegador | extensión | `events` | forma sí, contenido redactado |
| Actividad de workspace | API Ambiguous | `events` | sí (autenticado) |
| Resultado de Exa | web pública | `run_steps.output` | **no** — es dato, nunca instrucción |
| Rutina compilada | LLM | `routines` | validada con Zod antes de ejecutar |

El contenido que vuelve de la web (Exa) o de un correo entrante se trata como
**dato no confiable**: nunca se interpreta como orden para el agente. Es el vector
de inyección de prompt obvio en un producto que lee el trabajo ajeno.

## Elecciones y sus por qué

| Elección | Por qué | ADR |
|---|---|---|
| Monorepo pnpm | Un repo para la submission; contrato de tipos compartido entre web y core | [ADR-0001](decisions/ADR-0001-monorepo.md) |
| Postgres + Drizzle | Handbook; consultas tipadas sin ORM pesado | [ADR-0002](decisions/ADR-0002-persistencia.md) |
| Detección determinista | Demo reproducible + métrica real | [ADR-0003](decisions/ADR-0003-deteccion-determinista.md) |
| Trigger.dev para ejecutar | Durabilidad, reintentos e idempotencia gratis; `wait.forToken` resuelve la aprobación humana sin inventar estado | [ADR-0004](decisions/ADR-0004-ejecucion-durable.md) |
| CopilotKit en el frontend | La interrupción y la aprobación son UI generativa; AG-UI ya trae el streaming y el estado compartido | [ADR-0005](decisions/ADR-0005-copilotkit.md) |
| any-llm de Mozilla.ai | Proveedor intercambiable: si un modelo se cae en la demo, cambia una variable de entorno | [ADR-0006](decisions/ADR-0006-modelos.md) |
