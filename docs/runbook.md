# Runbook del MVP

Ejecutar `pnpm run doctor` con la aplicación detenida para revisar la configuración local.
No muestra claves, no contacta Ambiguous y no modifica tareas, documentos ni historial.
Con la aplicación encendida, `http://127.0.0.1:8080/healthz` indica si el core escucha;
la lectura de tareas en la interfaz comprueba el acceso actual al proveedor.
Que doctor informe Ambiguous pendiente no impide levantar el frontend ni Configuración.

| Síntoma | Acción |
|---|---|
| `pnpm` no aparece | Usar `corepack pnpm@9.15.0` y Node.js 22+. Mantener la versión explícita; no desactivar firmas. |
| Falta compilación en `pnpm start` | Ejecutar `pnpm build` y volver a iniciar. |
| Falta token local | Ejecutar `pnpm run setup` y usar `CORE_INGEST_TOKEN` de `.env` para abrir Configuración. No pegarlo en logs. |
| Falta clave Ambiguous | Levantar normalmente y guardarla en Configuración. No hace falta editar `.env` a mano ni generar datos. |
| El core no inicia | Revisar token local, permisos del directorio y puerto. La ausencia de clave Ambiguous o una falla del proveedor no deben impedir abrir Configuración. |
| Puerto ocupado | Detener la instancia existente. No cambiar de puerto para abrir un segundo escritor del mismo estado. |
| Bloqueo de escritor existente | Seguir “Recuperar un bloqueo” abajo; nunca borrar el JSON de historial. |
| El frontend no conecta | Revisar token local, URL del core en conexión avanzada y `ALLOWED_ORIGINS`. Si cambió el valor por defecto `CORE_API_URL`, reconstruir antes de `pnpm start`. |
| Ambiguous no conecta | Revisar el error e identidad en Configuración. Corregir la clave y comprobar su acceso al workspace. El error no se presenta como una lista vacía. |
| Cambié el token y perdí conexión | Es el comportamiento previsto: reconectar frontend y extensión con el token nuevo. Las conexiones existentes se invalidan. |
| La credencial cambia al reiniciar | Revisar si la terminal o servicio inyecta una variable que prevalece sobre `.env`. Retirarla de ese entorno para usar el valor guardado por la interfaz. |
| La extensión no conecta | Revisar core en puerto 8080, token configurado, recargar extensión compilada y pestaña de Ambiguous. |
| Lista de tareas vacía | Es válido antes de la integración. El compañero debe cargar sus tareas en el mismo workspace; pulsar actualizar. No generar datos para ocultar el vacío. |
| No aparece la tercera oferta | Confirmar dos traspasos manuales **verificados**, mediana ≥5 s, observación activa y oferta no silenciada. La receta reconoce solo traspasos. |
| Título/contexto no coinciden | Copiar exactamente los datos de la tarea que muestra la interfaz. La receta fija no reconoce otras transformaciones. |
| `created` | El POST devolvió ID pero falló la lectura. “Volver a leer” verifica sin crear otro documento. |
| `uncertain` | Buscar el título en Docs. No repetir automáticamente la creación: podría haber terminado aunque se cortara la respuesta. |
| `writing` tras perder conexión | Actualizar el estado. Si se reinicia el core, la corrida pasa a `uncertain` para evitar duplicados. |
| Error 401/403 del proveedor | Revisar credencial y permisos del workspace; no cambiar de workspace para ocultar el fallo. |
| Hay un historial de ensayo | Terminar/cancelar la corrida y pausar/reanudar para limpiar solo la secuencia de observación. El historial permanece. |

## Recuperar un bloqueo tras cierre abrupto

1. Detener el launcher y cualquier otro core. El error de bloqueo señala el mismo
   directorio privado configurado en `DEJAVU_DATA_DIR` (por defecto `.local`).
2. Leer únicamente el archivo `state-<workspace>-<identidad>.json.lock` correspondiente;
   contiene `pid` y `startedAt`. Comprobar ese PID con el monitor del sistema o
   `ps -p <PID> -o pid,command`. Si sigue vivo o hay dudas, no retirar el bloqueo.
3. Solo cuando ese proceso ya no existe y no hay otro escritor, retirar ese archivo
   `.lock`. **Conservar** `state-<workspace>-<identidad>.json` sin editarlo.
4. Iniciar con `pnpm start` o `pnpm dev`. Revisar corridas inciertas y los documentos
   existentes en Ambiguous antes de aprobar otro traspaso equivalente.

Los bloqueos no se eliminan automáticamente al arrancar: la reutilización de PID y
dos arranques simultáneos no deben poner en riesgo el historial. El cierre normal
retira el bloqueo después de atender las solicitudes pendientes.

No afirmar éxito a partir de un clic de aprobación. Mostrar el resultado del GET y
el documento en Ambiguous. Los tests offline prueban lógica, no disponibilidad del
servicio ni instalación de la extensión. `verify:live` genera datos reales y no forma
parte del levantamiento ni de la integración del dataset del compañero.
