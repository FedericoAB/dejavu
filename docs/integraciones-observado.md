---
tipo: plan
ultima_revision: 2026-09-12
---

# Lo que la API realmente hace (vs. lo que dice la documentación)

Se llena mientras se prueba con `curl`. Es el documento más valioso del día: cada
línea acá es media hora que otro no vuelve a perder.

## Ambiguous AI — comprobado en esta revisión

Contrato consultado: [OpenAPI oficial](https://app.ambiguous.ai/api/openapi.json).

| Endpoint | Observado | Notas |
|---|---|---|
| `GET /api/users/me` | 200; identidad y workspace | El core verifica identidad al iniciar; no registra credenciales. |
| `GET /api/tasks?limit=20` | `{ data, has_more, ... }` | No devuelve `{tasks}`. Puede omitir next_cursor; el conector usa limit/offset documentados. |
| `GET /api/tasks/:id` | `{ task }` | El documento se prepara con contexto de esta lectura. |
| `POST /api/tasks` | `{ task }` | Solo el ensayo explícito crea tareas DEMO, sin asignar ni suscribir usuarios. |
| `POST /api/documents` | Documento en la raíz, incluido `id` | `type: doc`, `title`, `content` Markdown y `visibility: restricted`. |
| `POST /api/documents`, `visibility: private` | 400 | El esquema solo declara string; la API admite restricted/workspace/link/public. Corregido el conector. |
| `GET /api/documents/:id` | Documento en raíz y contenido ProseMirror JSON string | Se comprueban ID, título y referencia a la tarea; tres resultados reales releídos. |

No se comprobó `Idempotency-Key` del proveedor. El core bloquea la repetición por
estado de corrida y conserva como incierta una escritura sin resultado confirmado.
Una respuesta 400 inicial no creó documento; se conservó el historial fallido en
`.local/archive-first-live-*` y se ejecutó un ensayo nuevo tras corregir el campo.

Correo, canales, hojas, Exa, CIBA y AG-UI siguen sin probar ni implementar en el MVP.

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
