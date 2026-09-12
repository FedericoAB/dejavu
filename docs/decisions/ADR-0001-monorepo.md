---
tipo: adr
ultima_revision: 2026-09-12
---
# ADR-0001 — Monorepo pnpm en vez de un repo por proyecto

**Estado:** aceptada · 2026-09-12

## Contexto
El handbook manda un repositorio git independiente por proyecto. La submission del
hackathon exige **un** repositorio público, y web/core/observer comparten el contrato
de tipos del DSL de rutinas.

## Decisión
Un monorepo con workspaces de pnpm: `apps/web`, `apps/core`, `apps/observer`,
`packages/*`.

## Consecuencias
- El tipo `Routine` se define una vez en `packages/routine-schema` y no puede divergir.
- Un solo `pnpm install`, un solo CI, una sola URL para el jurado.
- Contra: si mañana esto se vuelve producto, separar `observer` va a costar un día.
  Aceptable: hoy el costo de divergir es mayor.
- Excepción registrada en el README.
