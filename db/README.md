# db

El plan de datos futuro, con sus `check` e índices, está en
[../docs/plan-datos.md](../docs/plan-datos.md#esquema). El MVP vigente no usa
Drizzle, migraciones ni una base de datos: este directorio conserva solo esta nota
para no confundir el diseño previsto con el runtime entregado.

No hay `schema.ts`, `migrations/` ni `seed-demo.ts` que ejecutar. El dataset de
producto se carga por separado en Ambiguous y los datos sintéticos de tests viven en
fixtures o dobles en memoria; no se genera ni se importa un seed local.

Recordatorio: `timestamptz` siempre. Dinero en `numeric(14,2)`. Sin `deleted_at`.
