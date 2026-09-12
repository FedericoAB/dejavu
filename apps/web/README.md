# Frontend Déjà Vu

Next.js 15 (App Router), React y SCSS Modules. Arranque completo desde la raíz con
`pnpm dev` o `pnpm build && pnpm start`. URL local: `http://127.0.0.1:3000`.

| Ruta | Función |
|---|---|
| `/` · `/runs/:id` | Tareas, contexto, preparación, aprobación y resultado juntos |
| `/routines` · `/routines/task-handoff` | Receta fija y evidencia de repeticiones |
| `/runs` | Historial paginado |
| `/metrics` | Conteos y ahorro estimado calculados por el core |
| `/settings` | API key de Ambiguous, token del core y URL de conexión |

`src/core` concentra sesión, cliente bearer, carga y SSE. El token se guarda en
`sessionStorage` hasta desconectar/cerrar la pestaña y viaja por header; no aparece
en las URLs. Los tipos del dominio se importan como `type` desde el core, sin incluir
código del servidor en el bundle. `shared` contiene botón, input, card y estados.
Los estilos globales solo declaran tokens; pantallas y componentes usan módulos.

El stream global invalida las lecturas del dashboard cuando cambia el core. El stream
por corrida reemplaza snapshots comparando revisión; no se consulta por polling.
Tras una respuesta de acción perdida, primero se recupera el estado por GET.
El borrador se muestra como texto exacto y nunca se interpreta como HTML.

La receta y la UI funcionan sin CopilotKit, AG-UI ni LLM conforme ADR-0007. Los sponsors
previstos en `plan-frontend.md` no son dependencias implementadas.

`CORE_API_URL` en `.env` raíz define el endpoint inicial del navegador. Configuración
permite cambiarlo para la pestaña. La API key se ingresa oculta y se envía una vez al
core para validación y persistencia privada; ninguna lectura devuelve credenciales.
Una rotación de token actualiza la sesión web y revoca el anterior; copiar el nuevo
token a la extensión. Si se pierde la respuesta, recuperar primero el estado.

No hay dataset local, sembrado ni importación. Las tareas se leen de Ambiguous cuando
el compañero las incorpore. `pnpm test:browser` desde la raíz prueba ambas interfaces
con un core aislado en un directorio temporal; requiere Chrome y los puertos 8080/3100 libres.
