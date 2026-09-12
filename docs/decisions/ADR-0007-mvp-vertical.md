# ADR-0007 — Un flujo vertical antes de la arquitectura ampliada

Estado: implementada para el MVP — 2026-09-12.

La revisión encontró un detector funcional y aplicaciones sin código. La rúbrica
exige un resultado real en el entorno; completar todos los sponsors retrasa esa
prueba. Se aplica el recorte a plantillas fijas previsto en `plan-dia.md`.

Se implementa una única receta: tarea → copiar contexto → documento de traspaso.
El panel de una extensión vive en Ambiguous y lee las tareas de ese workspace.
Tras dos ejecuciones manuales verificadas, ofrece completar los campos del siguiente
traspaso. La aprobación conserva una vista previa exacta y el servidor controla la
escritura. No se automatiza correo ni acciones sobre las tareas de origen.

Excepciones concretas a los ADR anteriores:

- **ADR-0002:** archivo JSON privado con reemplazo por rename; un único proceso.
  UUID para corridas; no hay tablas ni migraciones. No ofrece garantías frente a
  pérdida de energía, dos procesos escritores o corrupción del disco.
- **ADR-0004:** máquina de estados pequeña en el core. Se persiste `writing` antes
  del POST; un reinicio lo convierte en `uncertain`. No hay reintento ciego ni
  garantía de exactly-once del proveedor. `created` conserva el ID para releerlo.
- **ADR-0005:** panel propio con aprobación en la extensión. No se usa CopilotKit,
  AG-UI ni SSE; las respuestas de las acciones actualizan la UI.
- **ADR-0006:** plantilla determinista, sin modelos ni compilación del DSL general.
- El conector de la única receta vive en `apps/core/src/connectors/ambiguous.ts`.
  El registro general de pasos de `packages/connectors` sigue pendiente.

El detector sigue siendo puro. Su configuración ahora admite números configurables
sin tipos literales; el perfil de traspasos fija longitud 3, mediana mínima 5 s y
score 0,35. Ese perfil solo acepta la secuencia `navigate,copy,doc.create`; no se
cambia el comportamiento general. Las duraciones vienen del reloj del servidor y
la documentación diferencia ensayos automatizados de mediciones humanas.

Límites: contexto leído al abrir la tarea, sin detección de cambios concurrentes;
no hay edición libre del documento, observación del DOM general ni multiusuario.
Los ejemplos de navegador son instrumentación real del panel, no reconocimiento
universal de workflows. La extensión todavía debe ensayarse instalada en Chromium.
