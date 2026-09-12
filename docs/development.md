# Desarrollo del MVP

El quickstart vigente está en [README](../README.md). Ejecutar desde la raíz:

```bash
pnpm install --frozen-lockfile
pnpm run setup
# Completar AMBIGUOUS_API_KEY en .env
pnpm verify
pnpm dev
```

Core en `127.0.0.1:8080`. La extensión se compila en `apps/observer/dist` y se carga
manualmente en Chrome/Chromium. Después de editar: `pnpm build`, recargar la
extensión y la pestaña de Ambiguous. No hay proceso Next.js, Postgres ni Trigger.

Los endpoints usan bearer `CORE_INGEST_TOKEN`; no hay CORS abierto a sitios web.
El background de la extensión hace las llamadas mediante `host_permissions`.
El único proceso escritor guarda estado privado por workspace e identidad en
`.local/state-*.json`. No iniciar dos cores ni ejecutar `verify:live` junto al core.

`pnpm verify:live` crea datos DEMO reales; se detiene si ya existe historial.
Conservar `.local/live-verification.json` como evidencia privada; no subirlo ni
mostrarlo sin revisar sus identificadores y contenido. Ver [demo](demo.md).
