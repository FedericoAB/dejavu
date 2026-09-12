# Qué se construyó — registro revisado 2026-09-12

Este archivo distingue código de planes. El equipo debe confirmar que cada parte
fue creada durante el período oficial de su sede; git no demuestra por sí solo la
elegibilidad. No se inventan horarios para el trabajo de esta revisión.

## Existente al iniciar la revisión

El commit `484ea12` contiene el detector, el contrato Zod de rutinas y documentos de
arquitectura/plan. Las aplicaciones core/web/observer tenían solo README.

- Detector: normalización, minería de subsecuencias contiguas, score y parámetros.
- 16 tests del detector y banco de 20 trazas sintéticas.
- `packages/routine-schema`: contrato para el futuro ejecutor general.
- Documentos y seis ADR; describían trabajo futuro, no integraciones realizadas.

## Implementado en esta revisión

| Parte | Ubicación |
|---|---|
| Receta de tarea a documento, detección tras dos vueltas, aprobación/rechazo | `apps/core/src/services/workflow.ts` |
| API HTTP con token, validación, listas paginadas y error uniforme | `apps/core/src/controllers/api.ts` |
| Cliente real Ambiguous: identidad, tareas, documentos y lectura posterior | `apps/core/src/connectors/ambiguous.ts` |
| Persistencia local y protección frente a reenvío de escritura incierta | `apps/core/src/repositories/state.ts` |
| Extensión MV3 y panel instrumentado con flujo manual y asistido | `apps/observer/` |
| Tests del workflow y API; ensayo separado que usa Ambiguous real | `apps/core/test/` |
| Lockfile, lint, setup, verify, quickstart, revisión y guion del MVP | Raíz, `scripts/`, `docs/` |

## Bloques preexistentes usados

Node, TypeScript, Express, Zod, Vitest, pnpm, esbuild y la API de Ambiguous aportan
infraestructura. La lógica de detección, el flujo de traspasos y su panel pertenecen
a este proyecto. El starter kit se consultó como guía de criterios y entregables;
no se copiaron sus aplicaciones.

**No implementados:** CopilotKit/AG-UI, Exa, Trigger.dev, Auth0/CIBA, any-llm,
compilador LLM, Postgres y observador general de navegador. Su presencia en los
planes no debe describirse como uso de los sponsors.

## Validación de esta revisión

`pnpm verify` pasa: 48 tests (16 del detector y 32 del core/conector), lint, tipos,
evaluación de 20 trazas y build. Ensayo HTTP con Ambiguous real: tres tareas DEMO,
tres documentos creados y releídos, rechazo y tercera oferta. Sigue pendiente la
prueba humana de la extensión instalada. Ver `docs/revision-mvp.md`.
