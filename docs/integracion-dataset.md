# Integración del dataset del compañero

El dataset se prepara por separado. Este repositorio **no lo genera, siembra ni
importa automáticamente**. El frontend y el backend funcionan con el estado vacío;
los datos se juntan cuando el compañero cargue las tareas en el workspace Ambiguous
conectado al agente.

## Contrato de entrada

La fuente del MVP es la API de tareas de Ambiguous. No se lee un CSV/JSON local ni se
utiliza el historial del core como dataset. El contrato vigente vive en
[`Task`](../apps/core/src/models/index.ts) y se valida en
[`AmbiguousWorkspace`](../apps/core/src/connectors/ambiguous.ts).

| Campo | Tipo esperado | Uso |
|---|---|---|
| `id` | `string`, UUID de Ambiguous | Identificador estable de la tarea; debe existir en el workspace. |
| `title` | `string` | Nombre de la tarea y base del título del documento. |
| `description` | `string` o `null` | Contexto copiado; si falta, el conector lo normaliza a `null`. |
| `status` | `string` | Estado registrado en la tarea. |
| `priority` | `string` | Prioridad registrada. |
| `due_date` | `string`, `null` u omitido | Fecha que devuelve Ambiguous; el traspaso conserva su representación. |

Para el formulario manual, preparar títulos de hasta 255 caracteres y descripciones
de hasta 12.000 caracteres. El documento se construye con la plantilla fija del MVP;
no interpreta instrucciones dentro de los datos ni infiere avances o compromisos.
No hacen falta campos del detector, eventos, métricas, patrones o documentos de
resultado dentro del dataset de tareas.

## Qué debe entregar el compañero

- Las tareas cargadas en Ambiguous y el identificador del workspace de destino.
- Confirmación de que el agente puede leer esas tareas y crear/leer documentos.
- Una lista privada de identificadores de las tareas elegidas para el ensayo, si
  necesitan coordinar el recorrido. No subir datos privados ni credenciales al repo.

Si entrega un archivo todavía sin cargar, conservarlo fuera del repositorio y acordar
la carga en Ambiguous por separado. Esta preparación no añade un importador ni lo
ejecuta. El UUID final de Ambiguous, no una posición de fila, identifica cada tarea.

## Unión y comprobación sin escrituras

1. Configurar en `.env` la credencial del agente del workspace acordado.
2. Ejecutar `pnpm run doctor` y después `pnpm dev` o `pnpm start`.
3. Abrir el frontend en Chrome y conectar con el token local.
4. Verificar la identidad del workspace, actualizar la lista y recorrer su paginación.
5. Comparar los títulos y contexto con los datos entregados. El core obtiene hasta
   20 tareas por página mediante `GET /v1/tasks?cursor=...`; no copia el dataset localmente.

Sin tareas, la respuesta válida contiene `data: []`, `hasMore: false` y
`nextCursor: null`. Un fallo de credencial o del proveedor se muestra como error, nunca
como ausencia de datos. Cambiar de credencial/workspace separa el historial local;
no mover un JSON de estado de una identidad a otra.

## Ensayo del flujo cuando estén los datos

Después de integrar, el recorrido de producto consiste en dos traspasos manuales
verificados y la oferta del tercero. Cada aprobación **crea un documento real** en
Ambiguous. Revisar la vista previa exacta antes de aprobar; el dataset de tareas no
se modifica. El detector usa eventos reales del recorrido y el reloj del servidor,
no métricas precargadas en el dataset.

No ejecutar `pnpm verify:live` para esta unión: esa herramienta histórica crea datos
DEMO propios y no utiliza la entrega del compañero como procedimiento de importación.
La falta del dataset queda como un estado vacío visible, no bloquea la instalación,
los tests offline ni la compilación.
