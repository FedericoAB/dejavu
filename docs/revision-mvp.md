# Revisión del mínimo viable — 2026-09-12

## Veredicto de la revisión inicial

**Todavía no cumple el mínimo funcional.** El repositorio contiene un detector
funcional y un contrato de rutinas; `apps/core`, `apps/web` y `apps/observer`
contienen README, sin aplicaciones ejecutables. El algoritmo aislado no demuestra
un agente integrado de punta a punta.

Esta es una evaluación técnica, no una calificación oficial ni un umbral de
aprobación publicado por el evento. Apuntamos a evidencia equivalente a **3/5 en
cada criterio**, antes de invertir en extras.

| Criterio | Evidencia inicial | Qué falta para un MVP defendible |
|---|---|---|
| Core Requirements & Functionality | Detector ejecutable; aplicaciones sin implementar | Contexto real → detección → oferta → aprobación → acción real → lectura del resultado |
| Innovation & Theme Alignment | Propuesta contextual y proactiva bien definida | Mostrar dos vueltas observadas y oferta en la tercera, sin prompt |
| Technical Execution & Integration | 15 tests pasan; typecheck pasa; contrato Zod | Integración real, validación, persistencia, rechazo y prevención de duplicados |
| Usefulness & Agentic Experience | Usuario y problema descritos | Mostrar trabajo ahorrado, contenido a aprobar, resultado y opción de rechazar |

## Lo que exige el starter kit

El [overview oficial](https://github.com/CopilotKit/agents-everywhere-starter-kit/blob/main/hackathon-overview.md)
admite una sola superficie y cualquier stack. Más sponsors o más superficies no
son criterios de puntuación. Lo central es una interacción completa cuyo contexto
aporte valor, con evidencia visible y control humano.

Las [reglas](https://github.com/CopilotKit/agents-everywhere-starter-kit/blob/main/hackathon-rules.md)
piden título, descripción, repositorio público, video de dos minutos y publicación
social según las instrucciones del organizador. Hay que distinguir código heredado
de trabajo del evento. **PENDIENTE:** confirmar ciudad, portal, plazo y período
oficial; la fecha de git por sí sola no acredita elegibilidad.

## Recorte propuesto

Una rutina: **leer una tarea de Ambiguous → preparar un documento de traspaso →
revisarlo y guardarlo en Ambiguous**. La superficie es una extensión del navegador,
con acciones instrumentadas dentro de su panel en el workspace. No se promete
observar cualquier interacción con el DOM de Ambiguous ni automatizar cualquier
rutina arbitraria.

Dos vueltas manuales exitosas alimentan el detector; al abrir la tercera tarea
aparece la oferta. Una plantilla fija compila el traspaso. La aprobación muestra
el contenido exacto antes de escribir. El resultado solo cuenta como verificado
cuando se vuelve a leer por su ID desde Ambiguous.

Quedan fuera del primer corte: correo, Exa, Auth0/CIBA, CopilotKit, compilador LLM,
Trigger.dev, dashboard, observación general y multiusuario. Son mejoras posteriores,
no requisitos oficiales. No se atribuye uso a sponsors aún no integrados.

## Comprobaciones iniciales

- `pnpm typecheck`: pasa en los dos paquetes existentes.
- `pnpm test`: 15 tests del detector pasan.
- `pnpm eval:detector`: 20 trazas sintéticas, precisión/recall/F1 = 1,000 en este
  banco; longitud correcta en 10/11 casos. No demuestra generalización ni el flujo real.
- API real: `GET /api/users/me` y `GET /api/tasks?limit=3` responden 200.
- El README inicial referencia `docs/demo.md`, `pnpm dev` y `db:migrate` sin
  implementaciones suficientes para ejecutarlos.
- `docs/que-se-construyo-hoy.md` y `docs/submission.md` atribuyen implementaciones
  y sponsors que son planes; deben corregirse antes de presentar.
- El detector general exige ≥20 segundos y score ≥0,50; una rutina de tres pasos
  y dos vueltas puede no alcanzar el score. Cualquier perfil específico debe
  documentarse y probarse sin inventar duraciones ni repeticiones.

## Puerta de salida

- [x] Instalación y build en copia limpia, sin node_modules ni credenciales; inicio real del core comprobado con .env local.
- [ ] Dos repeticiones reales; tercera oferta sin prompt.
- [x] Rechazo sin escritura y aprobación vinculada al contenido (HTTP/tests).
- [x] Documento real creado y leído nuevamente al reconstruir el servicio.
- [x] Doble clic/reintento de la misma corrida no duplica la escritura.
- [x] Error de proveedor en el estado, sin éxito falso ni reintento ciego (HTTP/tests).
- [ ] Demo visual en el navegador y video de ≤2 minutos.
- [ ] Entregables públicos y elegibilidad confirmados por el equipo.

## Resultado de la implementación y validación

- API y extensión implementadas; quickstart y lockfile actualizados.
- Aprobación controla el POST en el servidor y muestra el borrador antes de escribir.
- Las vueltas manuales exigen copiar título y descripción; la oferta asistida los
  toma de la tarea actual. No es un contador de clics con un resultado simulado.
- Prueba real por HTTP: rechazo, dos vueltas manuales, oferta en la tercera,
  tres documentos creados y leídos desde Ambiguous. Lectura de los tres después
  de reconstruir el servicio desde disco. Evidencia privada: `.local/live-verification.json`.
- El script usa tareas DEMO y pausas de ensayo; **no** acredita productividad humana
  ni reemplaza la demo visual. Quedaron tres tareas y tres documentos en el workspace.
- Corregida visibilidad de documentos: la API requiere `restricted`, no `private`.
- Corregida minería: agrupación por secuencia exacta, con regresión para colisiones
  del hash. No se afirma que la implementación sea un hash rodante.
- **PENDIENTE:** Chrome/Chromium no está instalado en esta máquina; no se comprobó
  la carga del content script ni el flujo humano de la extensión en su entorno.
- No se publicaron commits, video, post ni submission. Confirmar elegibilidad local.

Por tanto, hay implementación y evidencia de ejecución real del core, pero **todavía
no corresponde declarar completa la preparación para el hackathon**. La última
prueba funcional es el recorrido visual en la extensión; después quedan los
entregables. No se garantiza una nota del jurado.

### Última comprobación

`pnpm verify`: lint, typecheck, **29 tests**, evaluación de 20 trazas y build pasan.
Instalación `--frozen-lockfile`, `pnpm run setup` y build comprobados en una copia
limpia. Usar **run setup**: `pnpm setup` es un comando propio del gestor, no el
script del proyecto. Se verificó además el inicio del core, tareas paginadas y la
lectura de los tres documentos desde el proceso reiniciado.
