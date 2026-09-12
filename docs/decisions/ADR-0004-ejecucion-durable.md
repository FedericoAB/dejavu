---
tipo: adr
ultima_revision: 2026-09-12
---
# ADR-0004 — Las rutinas se ejecutan en Trigger.dev, no en el request

**Estado:** aceptada · 2026-09-12

## Contexto
Una rutina tiene 6 pasos, llamadas de red, y una pausa de duración desconocida
esperando la aprobación de un humano.

## Decisión
Cada corrida es una tarea de Trigger.dev. La aprobación usa `wait.createToken` +
`wait.forToken`. Los reintentos son por paso, con clave de idempotencia
`${runId}:${stepId}`.

## Consecuencias
- La corrida sobrevive al cierre del navegador y al reinicio del server.
- No escribimos una máquina de estados ni un worker propio: ahorro de medio día.
- La consola de Trigger.dev es nuestro panel de incidentes durante la demo.
- El handbook ya lo exigía en espíritu: todo lo que tarda más de 2 s sale del ciclo de
  petición, y todo job debe ser idempotente.
- Contra: una dependencia más de nube. Mitigado: Trigger.dev es self-hostable.
