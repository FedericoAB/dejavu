---
tipo: plan
ultima_revision: 2026-09-12
---

# Lo que la API realmente hace (vs. lo que dice la documentación)

Se llena mientras se prueba con `curl`. Es el documento más valioso del día: cada
línea acá es media hora que otro no vuelve a perder.

## Ambiguous AI

| Endpoint | Documentado | Observado | Notas |
|---|---|---|---|
| `GET /api/mail/inbox` | PENDIENTE | | forma de la respuesta, paginación |
| `POST /api/mail/send` | PENDIENTE | | ¿acepta `Idempotency-Key`? |
| `GET /api/tasks` | PENDIENTE | | ¿trae `updated_at` para poletear por delta? |
| `POST /api/documents` | PENDIENTE | | formato del cuerpo: ¿markdown, HTML, bloques? |
| `GET /api/sheets/:id/range` | PENDIENTE | | notación del rango |
| `PATCH /api/sheets/:id/cells` | PENDIENTE | | |
| `POST /api/channels/:id/messages` | PENDIENTE | | ¿`:id` es el nombre del canal o un id? El ejemplo del sitio usa `general`. |
| `POST /api/auth/signup-agent` | PENDIENTE | | qué devuelve: ¿la `ak_`? |
| Rate limit real | 1.000 acciones/mes (plan gratis) | | ¿qué cuenta como "acción"? ¿las lecturas también? |
| MCP | "los mismos endpoints por MCP" | | URL del servidor MCP |

## CopilotKit

| Cosa | Documentado | Observado |
|---|---|---|
| Nombre real de los hooks v2 | `useFrontendTool`, `useHumanInTheLoop`, `useAgentContext` | PENDIENTE — confirmar con `npx copilotkit onboard` |
| Import del provider | `@copilotkit/react-core/v2` | PENDIENTE |
| Conectar agente propio por AG-UI | PENDIENTE | |

## Exa

| Cosa | Documentado | Observado |
|---|---|---|
| `exa.answer(q, {text:true})` devuelve citas | sí | PENDIENTE |
| `output_schema` para salida estructurada | sí | PENDIENTE |

## Auth0

| Cosa | Documentado | Observado |
|---|---|---|
| CIBA: tiempo hasta que llega el push | PENDIENTE | |
| Datos de la acción en el consentimiento | sí ("rich authorization data") | PENDIENTE |
