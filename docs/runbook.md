# Runbook del MVP

| Síntoma | Acción |
|---|---|
| El core no inicia | Revisar Node 22+, `.env`, credencial Ambiguous y token local ≥24 caracteres. El inicio comprueba identidad y acceso al workspace. |
| No conecta el panel | Iniciar `pnpm dev`, revisar puerto 8080, pegar `CORE_INGEST_TOKEN`, recargar extensión y Ambiguous. |
| Lista vacía | Crear tareas cortas de demo en el workspace conectado; no se cargan datos ficticios automáticamente. |
| No aparece la tercera oferta | Confirmar dos traspasos manuales **verificados**, mediana ≥5 s, observación activa y oferta no silenciada. El perfil solo reconoce la receta de traspasos. |
| Título/contexto no coinciden | Copiar exactamente los datos de la tarea que muestra el panel. La receta fija no reconoce otras transformaciones. |
| `created` | El POST devolvió ID pero falló la lectura. “Volver a leer” verifica sin crear otro documento. |
| `uncertain` | Revisar Docs buscando el título. No repetir automáticamente la creación; podría haber terminado aunque se cortara la respuesta. |
| `writing` tras perder conexión | Actualizar el estado. Si se reinicia el core, se conserva como incierto para evitar duplicados. |
| Error 401/403 del proveedor | Revisar la credencial y permisos del workspace; no cambiar de workspace para ocultar el fallo. |
| Hay un historial de ensayo | Terminar/cancelar la corrida, pausar y reanudar para limpiar solo la secuencia de observación. El historial permanece. |

No afirmar éxito a partir de un clic de aprobación. Mostrar el resultado del GET y
el documento en Ambiguous. Los tests offline prueban lógica, no disponibilidad del
servicio ni instalación de la extensión.
