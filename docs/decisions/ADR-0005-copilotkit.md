---
tipo: adr
ultima_revision: 2026-09-12
---
# ADR-0005 — CopilotKit como capa de agente en el frontend

**Estado:** aceptada · 2026-09-12

## Contexto
El producto es, en buena medida, una interfaz: una interrupción en el momento justo,
con una tarjeta que muestra el plan y espera un sí. Necesitamos streaming, estado
compartido agente↔UI, y suspensión de la corrida dentro de un componente React.

## Decisión
CopilotKit v2 sobre el protocolo AG-UI. `useHumanInTheLoop` para la interrupción,
`useFrontendTool` para que el agente maneje la app, `useAgentContext` para exponerle
el estado.

## Consecuencias
- No escribimos transporte SSE, protocolo de eventos ni el puente de estado: un día menos.
- La UI es nuestra al 100% (headless): la tarjeta se ve como queremos.
- Es el argumento directo para "Best Use of CopilotKit": la UI generativa **es** el
  producto, y el agente abre la interfaz sin que nadie le escriba un prompt.
- Contra: acoplamiento a una API v2 relativamente nueva. Mitigado: el componente
  `TakeoverCard` se renderiza igual sin CopilotKit, así que el fallback existe.
