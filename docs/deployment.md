---
tipo: plan
ultima_revision: 2026-09-12
---

# Despliegue

Objetivo del día: una URL pública que el jurado pueda abrir.

| Pieza | Dónde | Comando |
|---|---|---|
| `apps/web` | Vercel | `vercel --prod` |
| `apps/core` | Railway | `railway up` |
| Postgres | Railway (plugin) | provisto |
| Tareas | Trigger.dev Cloud | `npx trigger.dev@latest deploy` |
| `apps/observer` | sin publicar: se carga descomprimida | `pnpm --filter observer build` |

## Orden
1. Base de datos y migraciones (`pnpm db:migrate` apuntando al `DATABASE_URL` remoto).
2. `core` (necesita la base).
3. `trigger deploy` (las tareas hablan con `core`).
4. `web` (necesita `CORE_API_URL` público).
5. CORS del core: agregar el dominio de Vercel. Explícito por origen, nunca `*`.

## Variables en producción
Las mismas de `.env.example`, más `NODE_ENV=production`. `CORE_INGEST_TOKEN` distinto
del de desarrollo.

## Revertir
- `web`: *Promote to production* de la build anterior en Vercel.
- `core`: rollback del deploy anterior en Railway.
- Migraciones: cada una es reversible o declara explícitamente que no lo es. Antes de
  la demo **no se corren migraciones nuevas**.

## Regla de la demo
A partir de las 17:30 no se despliega nada. Si algo se rompe después de esa hora, se
muestra el video grabado.
