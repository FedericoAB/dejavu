# db

Esquema y migraciones. El esquema completo, con sus `check` y sus índices, está en
[../docs/plan-datos.md](../docs/plan-datos.md#esquema) — se copia de ahí a
`schema.ts` de Drizzle, no se reinventa.

- `schema.ts` — definición Drizzle
- `migrations/` — SQL generado por `drizzle-kit`, versionado. Cambios manuales en
  producción: nunca.
- `seed-demo.ts` — carga una traza de demo para ensayar sin usar el navegador

Recordatorio: `timestamptz` siempre. Dinero en `numeric(14,2)`. Sin `deleted_at`.
