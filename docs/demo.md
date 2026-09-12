# Demo del MVP — máximo dos minutos

## Preparación

Iniciar el core y cargar la extensión según el README. Abrir Ambiguous en el
workspace de demo, mostrar la identidad del panel y preparar tres tareas cortas
con título y descripción diferentes. Son **datos de demostración en un servicio
real**. No presentarlos como trabajo de clientes.

Usar un historial nuevo para grabar la tercera oferta. Si ya se ejecutó
`verify:live`, pausar y reanudar la observación con todas las corridas terminadas
borra la secuencia; el historial permanece. No borrar archivos ni registros para
simular tiempos o éxitos. Cada vuelta manual debe durar al menos cinco segundos.

| Tiempo | Acción visible |
|---|---|
| 0:00–0:15 | Mostrar tareas en Ambiguous y abrir el panel Déjà Vu. Explicar: “Preparo traspasos para que otro continúe estas tareas”. |
| 0:15–0:40 | Abrir tarea 1. Copiar título y descripción a los campos manuales. Preparar, revisar y aprobar. Mostrar resultado verificado. |
| 0:40–1:05 | Repetir con tarea 2 y contexto diferente. La detección registra acciones del panel, no prompts. |
| 1:05–1:20 | Abrir tarea 3. Aparece “Hiciste esto 2 veces”. Mostrar la mediana real observada; no llamarla tiempo ahorrado. |
| 1:20–1:40 | “Sí, preparalo”: los campos se completan desde la tarea. Revisar el documento y aprobar la escritura. |
| 1:40–1:55 | Abrir Docs y buscar el título creado. Mostrar contenido e ID; recargar el panel y “Volver a leer desde Ambiguous”. |
| 1:55–2:00 | Mostrar la opción de rechazar y explicar que no escribe. Si cabe, usar una cuarta corrida y cancelarla. |

La ruta de rechazo también tiene tests reproducibles. Para evidenciarla visualmente,
ensayarla antes de grabar y conservar una toma. No confundir aceptar la oferta con
aprobar la escritura: son dos momentos separados.

## Frase honesta

“Déjà Vu reconoce la repetición en este panel de traspasos dentro de Ambiguous.
Después de dos vueltas ofrece preparar el siguiente documento. No escribo un
prompt, reviso lo que va a guardar y veo el resultado en el mismo workspace.”

## Qué falta antes de enviar

- Ensayo humano en Chrome/Chromium con la extensión instalada.
- Video de ≤2 minutos y enlaces públicos.
- Confirmación del período del evento, portal local y fecha de entrega.

`pnpm verify:live` prueba la API completa con eventos enviados por un script. Sus
esperas de ensayo no miden productividad humana ni sustituyen esta demo visual.
