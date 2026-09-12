---
tipo: plan
ultima_revision: 2026-09-12
---

> **Alcance:** este documento describe la visión ampliada. El MVP implementado y sus límites están en [revision-mvp.md](revision-mvp.md) y [ADR-0007](decisions/ADR-0007-mvp-vertical.md). No tomar los componentes previstos como integraciones ya disponibles.

# Plan — frontend (`apps/web`)

Next.js 15 (App Router) + CopilotKit v2 + SCSS. La pieza que se ve en el video.

## Qué es CopilotKit acá (y qué no)

CopilotKit es **el stack de frontend para agentes**: componentes de chat, *generative
UI* (el agente renderiza componentes React), acciones de frontend (el agente maneja
la app) y *human-in-the-loop* con UI propia. Se comunica con cualquier backend por el
protocolo **AG-UI** sobre SSE. No es el agente: es la capa que hace que el agente
tenga manos y cara dentro de la app.

Cuatro cosas nos da que si no las usáramos habría que escribirlas a mano:

| Primitiva | Para qué la usamos |
|---|---|
| `useHumanInTheLoop` / `renderAndWaitForResponse` | **La interrupción.** El agente pide confirmación y la UI es nuestra: la tarjeta "¿Lo hago yo?" con los pasos. La corrida se frena en el render y sigue con la respuesta del usuario. |
| `useFrontendTool` (ex `useCopilotAction`) | El agente maneja la app: abrir la rutina, resaltar el paso que está corriendo, navegar al tablero. |
| `useAgentContext` (ex `useCopilotReadable`) | Le pasamos el estado vivo sin serializar a mano: rutina abierta, patrones en formación, paso actual. |
| `useCoAgent` + estado compartido | El progreso de la corrida es estado del agente reflejado en la UI, no polling nuestro. |

## Estructura (funcionalidad, no tipo de archivo)

```
src/
├── core/                   providers, cliente del core, interceptores, guards
├── shared/                 sin estado, reutilizable en todo el proyecto
│   ├── button/             button.component.tsx · button.module.scss
│   ├── text-input/         el input único del proyecto, inyectado en los formularios
│   ├── badge/  card/  step-list/  empty-state/  skeleton/  error-state/
└── features/
    ├── interrupt/          la tarjeta "¿lo hago yo?" ← el corazón de la UX
    ├── routines/           lista, detalle, parámetros
    ├── runs/               timeline en vivo, aprobación
    ├── metrics/            tablero
    └── copilot/            provider, tools, contexto del agente
```

Cada componente en su carpeta, con su `.tsx` y su `.module.scss` al lado. Los estilos
se declaran **en el nivel donde se empiezan a usar**; global solo los tokens
(`styles/tokens.scss`: color, tipografía, espaciado, radios). Botón, input y card
son componentes chicos compartidos, fuera de cualquier pantalla, reutilizados en todas.

## Estado

Escala del handbook, sin subir escalones de más:

1. Estado local del componente — filtros, acordeones, drafts.
2. Servicio con hooks + SSE para la corrida en vivo (`useRunStream`).
3. Store global — **no**. Nada acá lo justifica.

## La interrupción, en detalle

Es el momento del producto entero. Especificación:

- Aparece **abajo a la derecha**, 380 px, sombra suave, entra en 180 ms con
  `transform: translateY` (nunca un modal: un modal bloquea el trabajo que estamos
  ofreciendo automatizar, y eso es una contradicción).
- Copy exacto: **"Hiciste esto 2 veces."** / sub: *"6 pasos · ~2 min cada vez"*.
- Lista de pasos colapsada a 3 + "ver los 6". Cada paso con su icono de app.
- Los parámetros detectados se muestran resaltados y **editables** antes de aceptar:
  el usuario ve que el agente entendió *qué* varía. Ahí se gana la confianza.
- Dos botones: **Sí, hacelo** (primario) · **No** (fantasma). "No" nunca vuelve a
  preguntar por 24 h, y el copy lo dice.
- Se cierra sola a los 30 s sin bloquear nada. El silencio es un "no" suave, no un
  descarte permanente.
- Accesible: `role="dialog"` con `aria-live="polite"`, foco atrapado solo si el
  usuario tabula hacia ella, `Esc` la cierra.

## Los cuatro estados obligatorios

Toda vista que carga datos implementa los cuatro. Que falte uno es un bug:

| Vista | Cargando | Vacío | Error | Con datos |
|---|---|---|---|---|
| Rutinas | esqueleto de 3 filas | "Todavía no vi nada repetido. Trabajá normal." | reintentar | lista |
| Corrida | timeline con pasos en gris | — | paso en rojo + "reintentar paso" | pasos tildados |
| Tablero | esqueleto de tarjetas | "Sin corridas aún" | reintentar | números + serie |

## Formularios

Reactivos y tipados (`react-hook-form` + el mismo esquema Zod que valida el core —
el tipo se deriva del esquema, no se escribe dos veces). Errores recién cuando el
campo fue tocado. **Todo botón de envío se deshabilita mientras la petición está en
curso**: el doble envío por doble clic es el bug más evitable que existe, y acá
mandaría dos correos reales.

## Accesibilidad y rendimiento — mínimo no negociable

- HTML semántico. Un `div` con `click` no es un botón.
- Todo input con su `label`. Contraste ≥ 4.5:1. Navegable con teclado de punta a punta.
- Foco visible; no se mata el `outline` sin poner algo mejor.
- Imágenes con `width`/`height`. Carga diferida por ruta. Listas > 100 ítems, virtualizadas.
- El timeline de la corrida se actualiza por SSE, no por polling.

## Rutas

| Ruta | Qué |
|---|---|
| `/` | Estado del observador, patrones en formación, últimas corridas |
| `/routines` · `/routines/:id` | Rutinas y detalle editable |
| `/runs/:id` | Timeline en vivo + aprobación |
| `/metrics` | Tablero (lo que se muestra al final del video) |
| `/api/copilotkit` | Runtime de CopilotKit (AG-UI ↔ core) |
