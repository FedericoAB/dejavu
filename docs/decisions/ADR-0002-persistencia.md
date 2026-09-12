---
tipo: adr
ultima_revision: 2026-09-12
---
# ADR-0002 — Postgres + Drizzle, PK `bigint identity`, migraciones con drizzle-kit

**Estado:** aceptada · 2026-09-12

## Contexto
El handbook dejaba dos PENDIENTES: qué clave primaria y qué herramienta de migraciones.

## Decisión
- Motor: PostgreSQL 16 (default del handbook, sin ADR de excepción necesaria).
- PK: `bigint generated always as identity`. Sistema cerrado, un solo escritor, sin app
  móvil offline, y los IDs legibles ahorran tiempo al depurar en una demo.
- Consultas: Drizzle ORM — tipado desde el esquema, SQL visible, sin la ceremonia de un
  ORM completo. Nada de `select *`.
- Migraciones: `drizzle-kit`, versionadas en `db/migrations/`.

## Consecuencias
- El nombre de archivo que genera drizzle-kit (`0001_nombre.sql`) no respeta el
  `YYYYMMDDHHMM_descripcion.sql` del handbook. Se acepta como excepción antes que
  pelear con la herramienta; el orden queda igual de determinista.
- Si en el futuro hubiera cliente offline generando IDs, migrar a `uuid v7`. Hoy no existe.
