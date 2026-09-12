# apps/observer

Extensión de Chrome (MV3). Captura la **forma** de lo que hacés, nunca el contenido.

## Por hacer

- [ ] `manifest.json` — permisos mínimos: `activeTab`, `storage`. Nada de `<all_urls>`
      si se puede evitar.
- [ ] `content-script.ts` — listeners de `click`, `copy`, `paste`, `submit`,
      `beforeunload`; `urlPattern` con los IDs ya sustituidos **antes** de salir
- [ ] `redact.ts` — la lista negra dura (ver `docs/plan-datos.md#privacidad`)
- [ ] `service-worker.ts` — cola local, lote cada 3 s, reintento con espera
- [ ] `popup/` — botón de pausa visible y contador de eventos de la sesión

## Lo que NUNCA se captura

`input[type=password]`, elementos con `data-dejavu-ignore`, campos cuyo label matchee
`/contrase|password|cvv|token|tarjeta|cbu|ruc|cedula|documento/i`, el DOM, capturas de
pantalla, el texto de la página, ni el contenido del portapapeles.

Del `copy` se guarda largo, tipo inferido y hash. Nada más.
