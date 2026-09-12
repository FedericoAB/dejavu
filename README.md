# Déjà Vu — el agente que mira cómo trabajás

> No le preguntás nada. Te mira trabajar, reconoce que ya hiciste esto antes,
> y a la tercera vez te interrumpe: **"Esto ya lo hiciste dos veces. ¿Lo hago yo?"**

Déjà Vu vive dentro de [Ambiguous AI](https://www.ambiguous.ai/) —el workspace donde
el equipo ya tiene su Mail, Chat, Docs, Sheets, Tasks, Calendar y CRM— y dentro del
navegador. Observa el flujo real de trabajo, detecta la secuencia repetida,
la compila en una **rutina ejecutable** y la corre de punta a punta con aprobación
humana en los pasos sensibles.

El entorno no es decorado: el agente es un compañero más del workspace, con su
propia identidad, su casilla de correo y sus tareas asignadas.

## Estado

| | |
|---|---|
| Etapa | Prototipo de hackathon (AI Thinkerers) |
| Fecha de build | 2026-09-12 |
| Demo | `docs/demo.md` |
| Métricas | `docs/metricas.md` — el tablero vive en `/metrics` |

## Instalación rápida

```bash
pnpm install
cp .env.example .env        # completar claves
docker compose up -d db     # Postgres 16
pnpm db:migrate
pnpm dev                    # web :3000 · core :8080 · trigger dev
```

Detalle en [docs/development.md](docs/development.md).

## Mapa del repositorio

```
apps/
  web/        Next.js 15 + CopilotKit  → interrupción "¿lo hago yo?", chat, tablero
  core/       API Node/TS (Express)    → ingesta, detección, compilación, ejecución
  observer/   Extensión Chrome MV3     → captura semántica del navegador
packages/
  detector/        motor de detección de patrones (puro, testeado, sin red)
  routine-schema/  DSL de rutinas + validación Zod (contrato compartido)
  connectors/      Ambiguous · Exa · Auth0 · any-llm
db/migrations/     SQL versionado
docs/              visión, arquitectura, planes, ADRs, métricas
```

## Documentación

| Documento | Responde |
|---|---|
| [docs/vision.md](docs/vision.md) | Qué construimos y por qué gana |
| [docs/arquitectura.md](docs/arquitectura.md) | Componentes, flujos, límites |
| [docs/plan-deteccion.md](docs/plan-deteccion.md) | **El corazón**: cómo se detecta el patrón |
| [docs/plan-backend.md](docs/plan-backend.md) | Capas, endpoints, ejecución |
| [docs/plan-frontend.md](docs/plan-frontend.md) | CopilotKit, estados, interrupción |
| [docs/plan-datos.md](docs/plan-datos.md) | Esquema, migraciones, retención |
| [docs/plan-integraciones.md](docs/plan-integraciones.md) | Cómo se enchufa cada sponsor |
| [docs/metricas.md](docs/metricas.md) | Sistema de métricas y scorecard |
| [docs/plan-dia.md](docs/plan-dia.md) | Cronograma por horas y cortes de alcance |
| [docs/runbook.md](docs/runbook.md) | Qué hacer cuando falla en la demo |
| [docs/decisions/](docs/decisions/) | ADRs |
| [MEMORY.md](MEMORY.md) | Memoria del agente que construyó esto |

## Convenciones

Este proyecto sigue el Engineering Handbook personal (vault, fuera de este repo).

### Excepciones registradas

| Excepción | Motivo |
|---|---|
| Monorepo en vez de un repo por proyecto | La submission del hackathon exige **un** repositorio público. |
| Nombre `dejavu` en vez de `ambito-cliente-producto` | Es el nombre de producto de la submission; se lee en el video y en el post. |
| Migraciones generadas por drizzle-kit (`NNNN_nombre.sql`) | Ver [ADR-0002](docs/decisions/ADR-0002-persistencia.md). El prefijo `YYYYMMDDHHMM_` del handbook no lo produce la herramienta. |
| Comentarios y docs en español, código en inglés | Es la convención del handbook, se mantiene. |

## Privacidad — no negociable

El observador **nunca** captura contraseñas, campos `type=password`, contenido de
inputs marcados `data-dejavu-ignore`, ni el texto completo de la página. Captura
*forma* (qué tipo de acción, sobre qué tipo de elemento, en qué dominio), y los
valores se guardan como parámetros redactados. Ver [docs/plan-datos.md](docs/plan-datos.md#privacidad).
