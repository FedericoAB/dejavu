# Desarrollo del MVP

El alcance vigente es la receta tarea → contexto → documento de traspaso de
[ADR-0007](decisions/ADR-0007-mvp-vertical.md), con frontend Next.js, core local y
extensión Chrome. La detección es determinista y la escritura requiere aprobación.
No se necesita un dataset para instalar, compilar o abrir las pantallas vacías.

## Primer arranque

Requisitos para levantar: Node.js 22 o superior, pnpm 9.15.0 y Chrome. La credencial
de agente de Ambiguous se puede guardar después desde Configuración. Desde la raíz:

```bash
pnpm install --frozen-lockfile
pnpm run setup
# setup genera CORE_INGEST_TOKEN; Ambiguous se configura luego en la interfaz.
pnpm run doctor
pnpm verify
pnpm dev
```

Si `pnpm` no está en el PATH, los mismos comandos se pueden ejecutar con
`corepack pnpm@9.15.0` en lugar de `pnpm`. La versión explícita evita que Corepack
intente resolver otra versión. No desactivar la verificación de firmas de Corepack.

Abrir `http://127.0.0.1:3000` y conectar con `CORE_INGEST_TOKEN` de `.env`. El token se
guarda en la sesión del navegador. Entrar a **Configuración**, guardar la clave
Ambiguous y comprobar la identidad del workspace. La API no devuelve la clave guardada
al navegador. No compartir `.env`, capturas de tokens ni el historial local.

`pnpm dev` inicia frontend y core juntos, recarga el código durante el desarrollo
y cierra ambos con Ctrl+C. Si uno falla, cierra también el otro. El core escucha
aunque falte la clave Ambiguous o el proveedor no responda: la pantalla de
Configuración permite corregir la conexión. El workspace puede estar completamente
vacío; una conexión pendiente o fallida se muestra aparte de una lista sin tareas.

## Comandos

| Comando | Resultado |
|---|---|
| `pnpm run setup` | Prepara `.env` y genera solo el token local, nunca datos del producto. |
| `pnpm run doctor` | Revisa Node, token local, archivos, dependencias y puertos. La falta de clave Ambiguous se informa como pendiente y no impide iniciar. No llama al proveedor ni modifica el estado. |
| `pnpm verify` | Lint, tipos, tests offline, evaluación determinista y compilación. |
| `pnpm dev` | Core y frontend con recarga para desarrollo. |
| `pnpm build && pnpm start` | Compilación y arranque local para ensayo, sin recarga del código. |
| `pnpm run doctor --production` | Además comprueba que existe la compilación del frontend. |
| `pnpm --filter @dejavu/core dev` | Solo el core, para diagnóstico. |

Los scripts resuelven sus rutas desde el repositorio y aceptan tanto `.env` como
variables ya inyectadas en el proceso. Configuración guarda las credenciales en el
`.env` raíz, con permisos `0600`, y las aplica al core en ejecución. Una variable
inyectada explícitamente por la terminal o un servicio vuelve a prevalecer sobre
`.env` al reiniciar; retirarla de ese entorno si se quiere administrar desde la UI.
`PNPM_EXEC_PATH` permite señalar el ejecutable o archivo CLI de pnpm si no está en
el PATH. No hace falta configurarlo al ejecutar los scripts con pnpm.

## Variables

| Variable | Uso / valor por defecto |
|---|---|
| `AMBIGUOUS_API_KEY` | Clave del agente; opcional para arrancar. Se puede guardar después desde Configuración. Necesaria para leer tareas y crear documentos reales. |
| `CORE_INGEST_TOKEN` | Bearer local de al menos 24 caracteres. |
| `CORE_HOST` / `CORE_PORT` | Escucha del core: `127.0.0.1` / `8080`. |
| `WEB_HOST` / `WEB_PORT` | Escucha del frontend: `127.0.0.1` / `3000`. |
| `CORE_API_URL` | URL inicial accesible por el navegador; el arranque la deduce del core si falta. Puede ajustarse por sesión desde la conexión avanzada; reconstruir si cambia el valor por defecto para `pnpm start`. |
| `ALLOWED_ORIGINS` | Orígenes web permitidos por CORS, separados por comas; el arranque incluye el host web y localhost con el puerto configurado. |
| `DEJAVU_DATA_DIR` | Directorio privado; por defecto `.local` en la raíz. Las rutas relativas también parten de la raíz. |

La clave Ambiguous y el token local no deben usar prefijo `NEXT_PUBLIC_`. Al cambiar
puertos u orígenes, mantener `CORE_API_URL`, la configuración de la extensión y
`ALLOWED_ORIGINS` coherentes. El ensayo está pensado para loopback y un único usuario.

## Credenciales en la interfaz

La pantalla Configuración reúne la clave Ambiguous, su estado e identidad y el cambio
de token local. Guardar la clave valida la identidad con una lectura al proveedor y
la aplica sin reiniciar. Guardar un nuevo token local invalida las conexiones
existentes: reconectar el frontend y la extensión con ese token. El endpoint
autenticado `GET /v1/settings` está disponible antes de conectar Ambiguous.

No se requieren claves de modelos, Exa, Trigger.dev, Auth0 ni una base de datos.
Host, puertos, CORS y directorio de persistencia siguen siendo configuración del
arranque; no son credenciales que el usuario deba completar en la pantalla.

## Chrome y extensión

1. Ejecutar `pnpm build`.
2. Abrir `chrome://extensions` y habilitar modo desarrollador.
3. Usar “Cargar descomprimida” y seleccionar `apps/observer/dist`.
4. Abrir Ambiguous con el workspace del agente, conectar la extensión con el token local.
5. Después de editar la extensión, recompilar, recargarla y recargar Ambiguous.

El frontend y la extensión comparten el core y el historial. No iniciar un core por
cada interfaz. Los permisos de la extensión apuntan a los hosts locales del MVP.

## Datos y persistencia

El dataset lo prepara el compañero y se incorpora luego en Ambiguous siguiendo
[integración del dataset](integracion-dataset.md). No hay generación, importación ni
sembrado automático en `setup`, `doctor`, `dev`, `build` o `start`.

El core conserva un archivo privado por workspace e identidad en
`.local/state-*.json`. Un bloqueo con PID impide dos escritores sobre ese archivo.
No ejecutar `verify:live`: es una herramienta histórica que **crea tareas y documentos
reales** y queda fuera de esta preparación. Los tests offline utilizan dobles aislados;
no preparan el dataset ni se conectan al workspace. Ver [runbook](runbook.md) para
cierres abruptos, resultados inciertos y recuperación sin duplicar escrituras.

## Prueba reproducible en Chrome

Con el core y el frontend detenidos, ejecutar `pnpm test:browser`. Requiere Chrome
instalado y puertos 8080/3100 libres; usa un perfil de navegador temporal, frontend
Next.js y core en memoria. No llama al proveedor ni crea el dataset. Respeta el
límite HTTP de 180 solicitudes/minuto; el ensayo puede esperar al cambio de ventana.
Las capturas quedan en `.local/browser-qa`. Al terminar cierra sus procesos y elimina
el perfil temporal. El frontend normal se abre luego con `pnpm dev` o `pnpm start`.

La carga automatizada de MV3 usa el comando del [protocolo de Chrome](https://chromedevtools.github.io/devtools-protocol/tot/Extensions/#method-loadUnpacked)
desde una sesión de navegador de prueba. No cambia las extensiones del perfil personal.
