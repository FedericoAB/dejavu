---
tipo: plan
ultima_revision: 2026-09-12
---

# Entorno local

## Requisitos
Node 22, pnpm 9, Docker (para Postgres), Chrome (para la extensión).

## Arranque

```bash
pnpm install
cp .env.example .env          # completar claves — ver abajo
docker compose up -d db
pnpm db:migrate
pnpm dev                      # web :3000 · core :8080 · trigger dev
```

Cargar la extensión: `chrome://extensions` → Modo desarrollador → *Cargar
descomprimida* → `apps/observer/dist` (antes: `pnpm --filter observer build`).

## Claves, en orden de urgencia

| Variable | De dónde sale | Sin ella |
|---|---|---|
| `AMBIGUOUS_API_KEY` | consola de agentes de Ambiguous | no hay ejecución |
| `DATABASE_URL` | docker compose | no arranca nada |
| `CORE_INGEST_TOKEN` | inventada, compartida con la extensión | no entra ningún evento |
| `ANTHROPIC_API_KEY` | consola de Anthropic | rutinas con nombre genérico |
| `EXA_API_KEY` | dashboard de Exa | pasos de búsqueda deshabilitados |
| `TRIGGER_SECRET_KEY` | proyecto de Trigger.dev | ejecución en proceso (modo degradado) |
| `AUTH0_*` | tenant de Auth0 | aprobación con botón en la UI |

Los secretos viven en `.env` local y en las variables del proveedor de deploy.
**Nunca** en el repo, nunca en el frontend, nunca en un log.

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm dev` | todo en paralelo |
| `pnpm test` | vitest en todos los paquetes |
| `pnpm test --filter detector` | solo el corazón, sin red |
| `pnpm eval:detector` | precisión/recall del detector sobre el banco etiquetado |
| `pnpm eval:compiler` | calidad del compilador (necesita LLM) |
| `pnpm db:migrate` · `pnpm db:studio` | migraciones y explorador |
| `pnpm seed:demo` | carga una traza de demo para probar sin usar el navegador |
| `pnpm lint` · `pnpm typecheck` | antes de cada commit |

## Probar la API de Ambiguous a mano

Lo primero del día, antes de escribir el conector:

```bash
source .env
curl -s -H "Authorization: Bearer $AMBIGUOUS_API_KEY" "$AMBIGUOUS_API_BASE/mail/inbox" | jq .
curl -s -H "Authorization: Bearer $AMBIGUOUS_API_BASE/tasks" | jq .
```

Si un endpoint no existe o responde distinto a lo documentado, se anota en
`docs/integraciones-observado.md` y el paso se marca `unsupported`. No se adivina.

## Simular una traza sin navegador

```bash
pnpm seed:demo --pattern cobranzas --repeat 2
# → debería aparecer la oferta en http://localhost:3000
```

Es el atajo que permite ensayar el guion del video sin repetir el flujo a mano.
