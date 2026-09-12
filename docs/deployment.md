---
tipo: operativo
ultima_revision: 2026-09-12
---

# Levantamiento local

El entregable del MVP se levanta en una computadora con **un único core escritor**.
El frontend Next.js se sirve en `127.0.0.1:3000` y el core en `127.0.0.1:8080`.
La extensión Chrome es otra interfaz del mismo core. Ambiguous es el proveedor real
de tareas y documentos; un workspace sin tareas es un estado válido.

## Preparación para ensayo

```bash
pnpm install --frozen-lockfile
pnpm run setup
# El token local queda en .env; Ambiguous se conecta desde Configuración.
pnpm run doctor
pnpm verify
pnpm start
```

`pnpm verify` incluye la compilación. Para cambios posteriores de interfaz, ejecutar
`pnpm build` antes de `pnpm start`. `pnpm dev` es la alternativa con recarga automática.
Ctrl+C espera las solicitudes pendientes y detiene ambos procesos. Ante un cierre
forzado durante un POST, seguir [runbook](runbook.md); no repetir la escritura.

Abrir el frontend en Chrome, conectar con el token local y guardar la clave de
Ambiguous en Configuración. El core puede iniciar sin esa clave o con el proveedor
desconectado; comprobar allí que muestra el workspace correcto. Cargar
`apps/observer/dist` como extensión descomprimida para usar
el panel dentro de Ambiguous. La comprobación inicial solo necesita lecturas y puede
terminar mostrando “sin tareas” hasta recibir los datos del compañero.

## Configuración y respaldo

| Recurso | Tratamiento |
|---|---|
| `.env` | Privado, permisos `0600`. La interfaz guarda aquí los cambios de credencial/token y los aplica al core. Puede omitirse inicialmente si el proceso recibe el token local. |
| `DEJAVU_DATA_DIR` | Ruta estable y privada; por defecto `.local` en la raíz del repositorio. |
| `state-*.json` | Historial e incertidumbres de escritura por workspace e identidad. Conservarlo. |
| `state-*.json.lock` | Exclusión del escritor; contiene el PID. Se retira al cerrar normalmente. |
| Dataset | Lo carga el compañero en Ambiguous; seguir [el contrato](integracion-dataset.md). |

Para respaldar o mover el estado, primero detener la aplicación y copiar los archivos
JSON privados completos. No restaurar un historial viejo para repetir una corrida:
el documento podría existir ya en el proveedor. Un archivo `*.lock` no forma parte
del respaldo que se restaura. No guardar estos archivos en Git.

La configuración guardada por la interfaz rige inmediatamente. Al reiniciar,
credenciales inyectadas explícitamente por la terminal o un servicio prevalecen
sobre `.env`; no mantener dos fuentes distintas si se administran desde la UI.
Después de cambiar el token local, volver a conectar las interfaces con el nuevo
valor. Guardar una clave Ambiguous comprueba identidad por lectura: no carga tareas
ni crea documentos.

## Límite del despliegue

No hay despliegue público realizado ni preparado como un sistema multiusuario.
No se usa Postgres, Trigger.dev ni un ejecutor distribuido en este MVP; los planes
anteriores de infraestructura no son instrucciones ejecutables del estado actual.
La excepción de persistencia de [ADR-0007](decisions/ADR-0007-mvp-vertical.md)
requiere conservar un solo escritor y un disco local estable.

Una futura publicación requiere decidir autenticación de usuarios, HTTPS, almacenamiento
durable compartido, coordinación de escritores y recuperación de escrituras inciertas.
No basta con exponer los puertos o replicar el proceso actual.
