# Revisión del mínimo viable — 2026-09-12

## Estado vigente

El MVP definido por [ADR-0007](decisions/ADR-0007-mvp-vertical.md) tiene frontend,
backend y extensión ejecutables. El arranque local reúne los procesos y preserva
el historial. El dataset se entrega por separado: **no se generó, cargó ni importó**
durante esta preparación.

| Criterio | Implementación y evidencia |
|---|---|
| Core Requirements & Functionality | Tarea → copia manual → detección → oferta → aprobación → documento → lectura. Frontend, extensión y API conectados. |
| Innovation & Theme Alignment | Oferta contextual en la tercera vuelta, sin prompt. Detector puro; solo cuenta evidencia manual verificada. |
| Technical Execution & Integration | API real Ambiguous, Zod, CORS exacto, token local, paginación, SSE, persistencia y un escritor. |
| Usefulness & Agentic Experience | Vista previa exacta, rechazo sin escribir, resultado verificable, historial, métricas honestas y controles de pausa. |

Es una revisión técnica del alcance implementado; no es una puntuación oficial del
jurado ni acredita elegibilidad o participación en un período determinado.

## Comprobaciones de esta preparación

- `pnpm verify`: lint, tipos, **48 tests** (16 detector, 32 core), evaluación del
  banco existente de 20 trazas y compilación de Next.js + extensión.
- El banco del detector existente mantiene precisión/recall/F1 1,000 y longitud
  correcta en 10/11 casos evaluables. No se creó ni amplió ese banco; no demuestra
  generalización ni productividad humana.
- Frontend en **Chrome 153 instalado**: conexión autenticada, dos vueltas manuales,
  oferta en la tercera sin prompt, rechazo sin escritura, asistencia, aprobación,
  lectura y recarga, historial, rutina, métricas, vacío/error y recuperación.
- Estado incierto sin botón para reenviar; pausa y reanudación siguen disponibles.
- Vista móvil de 390 px sin desbordes y revisión visual de capturas de las pantallas.
- La extensión MV3 se carga en un perfil temporal de Chrome y se comprueba su
  comunicación panel → service worker → core usando el bearer.
- Instalación con lockfile congelado y build en copia limpia sin `.env`,
  `node_modules` ni datos: correctos.
- Arranque de producción: frontend 3000 y core 8080 responden 200; conexión y
  lectura real de tareas e historial en ambas interfaces. Content script y frame
  cargados en el origen real de Ambiguous. Solo lecturas, sin documentos nuevos.
- Diagnóstico de configuración y pruebas aisladas del arranque, señales, cierre SSE
  y bloqueo del segundo escritor; sin imprimir secretos.

`pnpm test:browser` usa el core real con un `Workspace` temporal en memoria y un
reloj controlado del workflow. **No llama a Ambiguous, no persiste tareas ni genera
el dataset del compañero.** Sus capturas viven en `.local/browser-qa/`, fuera de Git.
Acredita funcionamiento automatizado de la UI y la API; no un ensayo humano contra
el proveedor ni ahorro de tiempo medido en usuarios.

## Evidencia real anterior, conservada

La sesión anterior comprobó por HTTP la API de Ambiguous: rechazo, dos vueltas
manuales, oferta en la tercera, tres documentos creados y releídos, incluida lectura
tras reconstruir el servicio. Evidencia privada: `.local/live-verification.json`.
Esos ensayos dejaron tres tareas y tres documentos DEMO en el workspace.
No se repitieron ni se agregaron datos durante esta preparación.

La frase anterior “Chrome/Chromium no está instalado” quedó obsoleta: Chrome está
instalado y ahora se usó para las pruebas. El frontend y SSE también reemplazan el
estado anterior de `apps/web` vacío.

## Pendiente después de recibir los datos

1. El compañero carga sus tareas en el workspace acordado, según
   [integracion-dataset.md](integracion-dataset.md).
2. El equipo realiza el recorrido humano en Ambiguous con dos traspasos y la oferta
   del tercero; las aprobaciones crean documentos reales revisados por el usuario.
3. Grabar el video de hasta dos minutos y preparar los entregables públicos si se
   decide presentar el proyecto. No se publicaron commits, video, post ni submission.
4. Confirmar ciudad, portal, plazo y período oficial del evento con el organizador.

El software queda preparado para ese levantamiento e integración. Sponsors de los
planes ampliados, observación general, rutinas arbitrarias y multiusuario quedan
fuera del MVP; no se atribuye uso de CopilotKit, Trigger.dev, Auth0, Exa ni Mozilla.ai.
