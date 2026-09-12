# Extensión Chrome MV3 del MVP

1. Desde la raíz, ejecutar `pnpm run setup`, completar la configuración indicada y
   levantar el proyecto con `pnpm dev`.
2. Ejecutar `pnpm --filter @dejavu/observer build` y abrir
   `chrome://extensions` en Chrome. Activar **Modo de desarrollador**, elegir
   **Cargar descomprimida** y seleccionar `apps/observer/dist`.
3. Abrir o recargar `https://app.ambiguous.ai` y pulsar **Déjà Vu ↗**. También
   se puede abrir el panel desde el icono de la extensión.
4. Pegar `CORE_INGEST_TOKEN` de `.env` en **Token del core local**. La clave de
   Ambiguous se configura exclusivamente en el servidor.
5. **Abrir tablero ↗** lleva al dashboard local en `http://127.0.0.1:3000`.
   El panel permite desconectarse y borrar el token guardado sin borrar el historial.

Si no está instalado pnpm, reemplazarlo por `npx --yes pnpm@9.15.0` en estos comandos.
Después de reconstruir la extensión, pulsar **Recargar** en `chrome://extensions`
y recargar Ambiguous para actualizar también el panel inyectado.

El panel lee tareas reales y emite acciones semánticas al usar su flujo de traspasos.
No es un observador del DOM completo ni registra contraseñas, portapapeles u otras
aplicaciones. La página anfitriona no recibe la clave del proveedor ni el token local.
Las tareas se incorporan desde Ambiguous cuando el equipo las tenga disponibles.

La sugerencia aparece después de la repetición detectada y prepara una vista previa
que requiere aprobación antes de crear el documento. **Escape**, el cierre y los
30 segundos de expiración ocultan la tarjeta solo en este panel; **No · silenciar
por 24 h** guarda el rechazo en el core. El cierre conserva los campos manuales.
La tarjeta no toma el foco al aparecer y se puede recorrer y cerrar con el teclado.

Ante una respuesta de escritura perdida, el panel consulta la corrida y exige
recuperar su estado antes de continuar. **Consultar estado** y **Volver a leer**
son lecturas; una escritura incierta no ofrece un reenvío.

Permisos: almacenamiento local y HTTP a 127.0.0.1. El content script corre solo en
`https://app.ambiguous.ai/*`. El background acepta solicitudes únicamente del panel
propio y de una lista de rutas. El core escucha exclusivamente en loopback.

PENDIENTE: ensayo humano en Chromium instalado. La compilación y los tests del core
no equivalen a verificar la entrega real del content script en el navegador.
