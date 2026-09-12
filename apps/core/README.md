# Core del MVP

API local Express, bearer token, validación Zod, una receta de traspasos y conector
REST de Ambiguous. `src/controllers` traduce HTTP; `services` implementa el dominio;
`repositories` conserva el estado; `connectors` conoce el proveedor.

Arranque desde la raíz: `pnpm dev`. Configuración y límites en el README raíz.
Tests: `pnpm --filter @dejavu/core test`. No hay migraciones ni Trigger en este corte.

Rutas: `GET /healthz`, `GET /v1/workspace`, `GET /v1/tasks`, `GET /v1/state`,
`POST /v1/runs`, `GET /v1/runs/:id`, `POST /v1/runs/:id/{prepare,dismiss,reject,approve,verify}`,
`POST /v1/observation`. Listas paginadas; errores con `code,message,details,requestId`.

El dashboard agrega `GET /v1/patterns`, `/v1/routines`, `/v1/routines/:id`,
`/v1/metrics`, `/v1/runs`, `/v1/stream` y `/v1/runs/:id/stream`.
También se admite el alias `/api/v1`. Los streams exigen bearer y envían el snapshot
vigente al conectar/reconectar; el cliente compara revisiones, no reproduce un log.

Las métricas y patrones salen del estado real, sin un dataset sembrado. La rutina
es una plantilla fija disponible incluso sin evidencia; la oferta requiere evidencia
manual verificada. Las listas usan `{data,meta}` y `offset`/`limit`, excepto tareas,
que conserva su cursor de página compatible con la extensión.

`ALLOWED_ORIGINS` permite configurar orígenes web exactos; la extensión conserva
host_permissions y autenticación bearer. No hay CORS comodín. El core usa un archivo
exclusivo `.lock` por workspace e identidad y lo retira al cerrar normalmente.
