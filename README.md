# Déjà Vu — reconoce la repetición y ofrece ayuda

Prototipo para una persona que prepara traspasos de tareas en **Ambiguous AI**.
Dos veces copia título y contexto a un documento; al abrir la siguiente tarea,
Déjà Vu reconoce el patrón y ofrece preparar el traspaso sin escribir un prompt.
El documento se revisa antes de guardarlo y se vuelve a leer desde Ambiguous.

## Estado real

Implementado: extensión Chrome MV3 con panel dentro de Ambiguous, API local,
detector determinista, plantilla de traspaso, aprobación, rechazo, historial
persistente y lectura del documento creado. El observador registra **solo acciones
del panel de traspasos**, no los clics generales de Ambiguous ni otras aplicaciones.
La receta es fija: no aprende rutinas arbitrarias ni usa un LLM.

La [revisión contra los cuatro criterios](docs/revision-mvp.md) distingue evidencia
comprobada de pendientes. El [guion de demo](docs/demo.md) muestra el alcance actual.
Los documentos `plan-*` describen la visión ampliada, no funcionalidad disponible.

## Instalación desde un clon limpio

Requisitos: Node.js 22+, pnpm 9.15 y Chrome/Chromium para la extensión.
Si no tenés pnpm, reemplazá `pnpm` por `npx --yes pnpm@9.15.0` en cada comando.

```bash
pnpm install --frozen-lockfile
pnpm run setup
# Editar .env: AMBIGUOUS_API_KEY de tu workspace de demostración.
pnpm verify
pnpm dev
```

`setup` conserva el .env existente y genera un token local aleatorio si falta.
Solo se necesita la credencial **AMBIGUOUS_API_KEY**, con lectura de tareas y
creación/lectura de documentos. No hacen falta claves de modelos, Docker ni Postgres.
El core comprueba la identidad de Ambiguous al iniciar y escucha en `127.0.0.1:8080`.

1. En `chrome://extensions`, activar modo desarrollador → **Cargar descomprimida** →
   seleccionar `apps/observer/dist` (generado por `pnpm verify` o `pnpm build`).
2. Abrir o recargar `https://app.ambiguous.ai/` y pulsar **Déjà Vu ↗**.
3. Conectar con `CORE_INGEST_TOKEN` del .env. La clave de Ambiguous nunca entra en la extensión.
4. Usar tres tareas cortas del workspace de demostración y seguir [la demo](docs/demo.md).

## Comprobación

```bash
pnpm verify        # lint, tipos, tests, evaluación del detector y build de extensión
pnpm verify:live   # ESCRIBE datos DEMO reales: hasta 3 tareas y 3 documentos privados
```

El ensayo real usa HTTP y la API de Ambiguous; no reemplaza el ensayo humano de la
extensión. Requiere un historial local vacío y conserva su evidencia en
`.local/live-verification.json`. Si ya hay corridas, se detiene para conservarlas.
No ejecutar al mismo tiempo que el core: el MVP usa un único escritor por archivo.
No envía correos, mensajes ni asigna tareas. Los datos DEMO quedan en el workspace.

## Límites y controles

- Una persona, un workspace y un proceso. No publicar el core en Internet.
- Aprobación del contenido preparado antes de cada escritura; rechazo no escribe.
- Una corrida guarda como máximo una vez. Si la red se corta al escribir, no reenvía
  automáticamente: muestra el estado incierto para revisar Docs.
- Un documento creado solo figura como verificado después de un GET que comprueba
  ID, título y referencia a la tarea. La lectura se puede repetir tras recargar.
- Pausar la observación borra la secuencia local; silenciar una oferta dura 24 h.
- Solo los traspasos manuales alimentan la detección. Perfil específico: 3 pasos,
  2 repeticiones, mediana ≥5 s, score ≥0,35; no cambia los umbrales generales.
- Los eventos guardan forma y referencia local. El historial **sí contiene los datos
  de las tareas y borradores** necesarios para revisar la ejecución; se guarda en
  `.local/` con permisos privados, fuera de git. No es almacenamiento cifrado.

## Mapa

| Directorio | Estado |
|---|---|
| `apps/core` | API Express, conector Ambiguous, workflow y persistencia local |
| `apps/observer` | Extensión MV3 y panel de trabajo instrumentado |
| `packages/detector` | Motor puro y evaluación sintética |
| `packages/routine-schema` | Contrato de rutinas de la visión ampliada; todavía no usado por la receta fija |
| `apps/web`, `packages/connectors`, `db` | Planes pendientes, sin runtime en este MVP |

[ADR-0007](docs/decisions/ADR-0007-mvp-vertical.md) registra el recorte respecto de
Postgres, Trigger.dev, CopilotKit y el compilador LLM. No se atribuye uso de esas
herramientas en la submission actual. El código usa inglés y la documentación,
español. Las notas personales y credenciales nunca forman parte del repo público.
