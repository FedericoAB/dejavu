# Core del MVP

API local Express, bearer token, validación Zod, una receta de traspasos y conector
REST de Ambiguous. `src/controllers` traduce HTTP; `services` implementa el dominio;
`repositories` conserva el estado; `connectors` conoce el proveedor.

Arranque desde la raíz: `pnpm dev`. Configuración y límites en el README raíz.
Tests: `pnpm --filter @dejavu/core test`. No hay migraciones ni Trigger en este corte.

Rutas: `GET /healthz`, `GET /v1/workspace`, `GET /v1/tasks`, `GET /v1/state`,
`POST /v1/runs`, `GET /v1/runs/:id`, `POST /v1/runs/:id/{prepare,dismiss,reject,approve,verify}`,
`POST /v1/observation`. Listas paginadas; errores con `code,message,details,requestId`.
