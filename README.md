# Déjà Vu — reconoce la repetición y ofrece ayuda

MVP para preparar traspasos de tareas en **Ambiguous AI**. Dos vueltas manuales
verificadas permiten reconocer la secuencia y ofrecer preparar la siguiente, sin
escribir un prompt. Cada documento se revisa antes de guardarlo y se lee de vuelta
para confirmar el resultado.

## Qué está implementado

- **Frontend Next.js:** tareas y editor en una pantalla; rutinas, historial y métricas
  separados. Configuración de API key, token y URL del core; seguimiento SSE y diseño móvil.
- **Extensión Chrome MV3:** panel dentro de Ambiguous, oferta no bloqueante,
  aprobación, rechazo, historial y acceso al tablero.
- **Core Express:** API validada, detector determinista, receta fija, conector real
  Ambiguous, bearer local, CORS por origen, paginación y persistencia privada.
- **Arranque:** un comando para frontend + backend, diagnóstico previo, bloqueo de
  único escritor, cierre coordinado y recuperación de escrituras inciertas.

El [alcance vigente](docs/decisions/ADR-0007-mvp-vertical.md) es una receta de
traspasos. No observa clics generales de Ambiguous ni otras aplicaciones y no aprende
rutinas arbitrarias. Los documentos `plan-*` describen la visión ampliada, que no se
confunde con integraciones disponibles.

## Levantar desde un clon limpio

Requisitos: **Node.js 22+, pnpm 9.15.0 y Chrome**. Desde la raíz del repositorio:

```bash
pnpm install --frozen-lockfile
pnpm run setup
# setup genera CORE_INGEST_TOKEN; la API key se puede completar desde la UI.
pnpm run doctor
pnpm verify
pnpm dev
```

Si pnpm no está instalado, reemplazar `pnpm` por `npx --yes pnpm@9.15.0`.
Usar **run setup** y **run doctor**: pnpm también tiene comandos propios con esos nombres.

Abrir **http://127.0.0.1:3000** y conectar con `CORE_INGEST_TOKEN` de `.env`.
En **Configuración**, guardar la API key de Ambiguous. Desde esa pantalla también se
puede generar o cambiar el token y ajustar la URL del core. Las credenciales se
validan y guardan en el servidor local; los cambios se aplican sin reiniciar.
El core escucha en `127.0.0.1:8080` y arranca aunque falte la clave del proveedor.
Ctrl+C cierra ambos procesos.
Para un ensayo con la compilación de producción: `pnpm build` y `pnpm start`.

No se necesita Docker, Postgres ni claves de modelos. `AMBIGUOUS_API_KEY` necesita
lectura de identidad/tareas y creación/lectura de documentos en el workspace acordado.
Un workspace sin tareas muestra el estado vacío; un fallo de conexión muestra error.

## Dataset: lo prepara el compañero

**No se generó ni se agregó un dataset.** Ningún comando de instalación, compilación
o arranque crea o importa datos de producto. La integración queda documentada en
[docs/integracion-dataset.md](docs/integracion-dataset.md): las tareas se cargan luego
en Ambiguous y ambas interfaces las leen desde la API del workspace.

## Extensión

1. Ejecutar `pnpm build`.
2. Abrir `chrome://extensions`, activar modo desarrollador y **Cargar descomprimida**.
3. Seleccionar `apps/observer/dist`.
4. Abrir o recargar `https://app.ambiguous.ai/` y pulsar **Déjà Vu ↗**.
5. Conectar con el mismo `CORE_INGEST_TOKEN`. No iniciar otro core.

La oferta se cierra con Escape o a los 30 segundos. **No** la silencia por 24 horas.
Pausar borra la secuencia observada para no unir acciones a ambos lados de la pausa.

## Validación

```bash
pnpm verify         # lint, tipos, tests, banco existente del detector y build
pnpm test:browser   # Chrome instalado, puertos 8080/3100 libres; detener pnpm dev/start
```

La prueba de navegador levanta un core con dobles de prueba y un frontend aislado.
Comprueba configuración, rotación de token, detección, aprobación, rechazo,
resultado incierto, recarga, SSE, estados vacíos/error y móvil. Usa un directorio
temporal que elimina al terminar, no carga el `.env` real ni llama a Ambiguous.
Capturas privadas en `.local/browser-qa`.
No representa mediciones humanas de productividad. La
[revisión del MVP](docs/revision-mvp.md) distingue la evidencia automatizada del
ensayo real posterior a la entrega de datos.

**No ejecutar `pnpm verify:live` para esta preparación.** Es un ensayo histórico que
crea tareas y documentos DEMO reales; no forma parte de verify, test:browser ni del
procedimiento de integración del compañero.

## Controles y límites

- Un usuario, un workspace y un único core escritor local. No hay despliegue público.
- Aprobación antes de cada escritura; rechazo no escribe. Misma corrida: máximo un POST.
- Red interrumpida al guardar: estado incierto, sin reenvío automático. Si existe ID,
  se puede reintentar solo la lectura. El historial sobrevive a la recarga y reinicio.
- El detector recibe forma y referencia local; solo cuentan vueltas manuales verificadas.
  Perfil: 3 pasos, soporte ≥2, mediana ≥5 s y score ≥0,35.
- Las métricas usan las corridas guardadas. El ahorro se etiqueta como estimado; sin
  evidencia se muestra “—”. El historial puede contener ensayos anteriores.
- `.local/` contiene títulos, contexto y borradores privados, sin cifrado. Fuera de Git.

## Mapa

| Directorio | Implementación |
|---|---|
| `apps/web` | Next.js App Router + SCSS, cliente autenticado y seguimiento SSE |
| `apps/core` | API Express, Ambiguous, workflow y persistencia con único escritor |
| `apps/observer` | Extensión MV3 y panel de traspasos |
| `packages/detector` | Motor puro y evaluación existente |
| `packages/routine-schema` | Contrato de la visión ampliada, fuera de la receta fija |
| `packages/connectors`, `db` | Planes sin runtime en este MVP |

[Desarrollo](docs/development.md) · [Levantamiento](docs/deployment.md) ·
[Runbook](docs/runbook.md) · [Demo](docs/demo.md)
