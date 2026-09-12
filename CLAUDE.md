# Instrucciones para agentes de código en este repo

Contexto completo en [MEMORY.md](MEMORY.md). Leelo antes de tocar nada.

## Reglas cortas

- **Idioma:** código, nombres de tablas y columnas en inglés. Comentarios,
  documentación y mensajes de commit en español.
- **Nunca** commitees notas personales, `.env`, ni nada de `~/Desktop/aithinkerers/notas/`.
- **Capas del backend:** ningún `req`, `res` ni código HTTP por debajo de `controllers/`.
- **Un solo formato de error** en toda la API (ver `docs/plan-backend.md`).
- **Paginación siempre**, aunque hoy haya 12 filas.
- `timestamptz`, nunca `timestamp`. Dinero en `numeric(14,2)`, nunca `float`.
- Nada de `select *` en código de aplicación.
- Toda vista que carga datos implementa los cuatro estados: cargando, vacío, error,
  con datos. Que falte uno es un bug.
- Botón, input y card son componentes compartidos en `shared/`, fuera de las pantallas.
  Los estilos se declaran en el nivel donde se empiezan a usar; global solo los tokens.
- El detector (`packages/detector`) no importa red, base de datos ni modelos. Nunca.
- Antes de agregar un tipo de paso: un archivo en `connectors/steps/` + una entrada en
  el registro. Nada más cambia.

## Antes de abrir un PR

`pnpm lint && pnpm typecheck && pnpm test`
