# Extensión Chrome MV3 del MVP

`pnpm build` genera `dist`; cargar esa carpeta como extensión descomprimida en
Chrome/Chromium. Abrir Ambiguous y pulsar **Déjà Vu ↗**. También hay un popup desde
el icono de extensión. Configurar el token local del core, nunca la clave Ambiguous.

El panel lee tareas reales y emite acciones semánticas al usar su flujo de traspasos.
No es un observador del DOM completo ni registra contraseñas, portapapeles u otras
aplicaciones. La página anfitriona no recibe la clave del proveedor ni el token local.

Permisos: almacenamiento local y HTTP a 127.0.0.1. El content script corre solo en
`https://app.ambiguous.ai/*`. El background acepta solicitudes únicamente del panel
propio y de una lista de rutas. El core escucha exclusivamente en loopback.

PENDIENTE: ensayo humano en Chromium instalado. La compilación y los tests del core
no equivalen a verificar la entrega real del content script en el navegador.
