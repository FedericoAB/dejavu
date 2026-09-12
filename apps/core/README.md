# apps/core

API y cerebro. Node 22 + TypeScript + Express. Plan completo en
[../../docs/plan-backend.md](../../docs/plan-backend.md).

## Por hacer (en orden)

- [ ] `src/models/` — tipos de dominio
- [ ] `src/repositories/` — Drizzle, sin `select *`
- [ ] `src/services/normalizer.ts` — envuelve `@dejavu/detector`
- [ ] `src/services/detection.ts` — detector + cooldowns + creación de la oferta
- [ ] `src/routes/ingest.ts` + `controllers/ingest.controller.ts` — el camino caliente
- [ ] `src/services/compiler.ts` — candidato → `Routine` (único punto con LLM)
- [ ] `src/trigger/run-routine.ts` — la corrida, con `wait.forToken`
- [ ] `src/services/watcher.ts` — poll de Ambiguous → eventos
- [ ] `src/services/metrics.ts` + `routes/metrics.ts`
- [ ] middleware de errores (un solo formato), pino con `requestId`, helmet, rate limit

## Regla que no se rompe

Ningún `req`, `res` ni código HTTP por debajo de `controllers/`.
