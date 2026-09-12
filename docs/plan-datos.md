---
tipo: plan
ultima_revision: 2026-09-12
---

> **Alcance:** este documento describe la visión ampliada. El MVP implementado y sus límites están en [revision-mvp.md](revision-mvp.md) y [ADR-0007](decisions/ADR-0007-mvp-vertical.md). No tomar los componentes previstos como integraciones ya disponibles.

# Plan — datos

PostgreSQL 16. Nomenclatura del handbook: tablas `snake_case` plural, columnas
`snake_case` singular, PK `id`, FK `<tabla_singular>_id`, índices `idx_<tabla>_<cols>`.

## Decisiones que el handbook dejaba PENDIENTES

| Decisión | Elección | Motivo |
|---|---|---|
| Clave primaria | `bigint generated always as identity` | Sistema cerrado, un solo escritor, legible al depurar. No hay app offline. |
| Herramienta de migraciones | `drizzle-kit` | Genera el SQL desde el esquema tipado y ya tenemos Drizzle para consultar. Ver [ADR-0002](decisions/ADR-0002-persistencia.md). |

## Esquema

```sql
-- todas las tablas llevan estas tres columnas
-- id bigint generated always as identity primary key
-- created_at timestamptz not null default now()
-- updated_at timestamptz not null default now()

create table users (
  id           bigint generated always as identity primary key,
  auth0_sub    text not null,
  email        text not null,
  display_name text not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint uq_users_auth0_sub unique (auth0_sub)
);

create table events (
  id           bigint generated always as identity primary key,
  user_id      bigint not null references users(id),
  source       text not null,
  kind         text not null,
  app          text not null,
  step_key     text not null,          -- sha1 de la forma del paso
  url_pattern  text,
  role         text,
  label        text,
  values       jsonb not null default '{}'::jsonb,   -- redactado
  occurred_at  timestamptz not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint ck_events_source check (source in ('browser','ambiguous','app'))
);
create index idx_events_user_id_occurred_at on events (user_id, occurred_at desc);
create index idx_events_step_key on events (step_key);

create table patterns (
  id                 bigint generated always as identity primary key,
  user_id            bigint not null references users(id),
  fingerprint        text not null,
  step_keys          text[] not null,
  support            integer not null,
  score              numeric(5,4) not null,
  median_duration_ms integer not null,
  status             text not null default 'detected',
  dismissed_count    integer not null default 0,
  last_offered_at    timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint uq_patterns_user_fingerprint unique (user_id, fingerprint),
  constraint ck_patterns_status check (status in ('detected','offered','dismissed','muted','compiled'))
);

create table routines (
  id                  bigint generated always as identity primary key,
  user_id             bigint not null references users(id),
  pattern_id          bigint not null references patterns(id),
  name                text not null,
  description         text not null,
  definition          jsonb not null,        -- Routine, validada con Zod al leer
  estimated_manual_ms integer not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint fk_routines_patterns foreign key (pattern_id) references patterns(id)
);

create table runs (
  id             bigint generated always as identity primary key,
  routine_id     bigint not null references routines(id),
  user_id        bigint not null references users(id),
  trigger_run_id text,
  status         text not null default 'queued',
  params         jsonb not null default '{}'::jsonb,
  trigger_source text not null,             -- 'offer' | 'manual' | 'schedule'
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint ck_runs_status check (status in ('queued','running','waiting_approval','succeeded','failed','rejected','timeout'))
);
create index idx_runs_user_id_created_at on runs (user_id, created_at desc);

create table run_steps (
  id            bigint generated always as identity primary key,
  run_id        bigint not null references runs(id),
  step_id       text not null,
  step_type     text not null,
  status        text not null default 'pending',
  attempt       integer not null default 0,
  input         jsonb,
  output        jsonb,
  error_code    text,
  approval_token text,
  duration_ms   integer,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint uq_run_steps_run_step unique (run_id, step_id),
  constraint ck_run_steps_status check (status in ('pending','running','waiting_approval','succeeded','failed','skipped','rejected'))
);

create table metric_events (
  id         bigint generated always as identity primary key,
  user_id    bigint not null references users(id),
  name       text not null,       -- 'pattern.detected' | 'offer.shown' | 'offer.accepted' | ...
  value      numeric(14,2),
  props      jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_metric_events_name_occurred_at on metric_events (name, occurred_at desc);
```

## Reglas aplicadas

- **`timestamptz` siempre, nunca `timestamp`.** Se guarda en UTC y se convierte en
  presentación. (Paraguay cambió de huso en 2024; los `timestamp` sin zona son deuda.)
- La base cuida su propia integridad: FK, `not null` y `check`, aunque la app valide.
- Nada de lógica de negocio en triggers.
- Enumeraciones con `check` explícito, no tipos `enum` nativos: agregar un valor con
  `enum` nativo pide migración con lock.
- Toda columna que se filtra en producción tiene índice.
- **Nada de `select *`** en código de aplicación.
- Sin `deleted_at`: el negocio no lo pide, y agregarlo "por las dudas" obliga a
  filtrar en cada consulta para siempre.

## Privacidad

Un producto que observa el trabajo ajeno es un producto de datos personales. Lo que
se decidió, en orden de importancia:

1. **Redacción en el origen, no en el servidor.** La extensión recorta antes de
   enviar. Lo que no sale del navegador no se puede filtrar.
2. **Listas negras duras:** `input[type=password]`, cualquier elemento con
   `data-dejavu-ignore`, campos cuyo `label` matchee `/contrase|password|cvv|token|tarjeta|cbu|ruc|cedula|documento/i`.
3. **Nunca se captura** el DOM, ni screenshots, ni el texto de la página, ni el
   portapapeles completo: del `copy` se guarda largo, tipo inferido y un hash, no el contenido.
4. **Valores truncados a 120 caracteres** y, si matchean patrón de correo / documento /
   tarjeta, se guarda solo la forma (`email`, `doc`, `card`).
5. **Retención:** `events` se borran a los 30 días (`pg_cron` diario). Los patrones y
   rutinas sobreviven porque ya son abstracciones, no contenido.
6. **Interruptor visible:** botón de pausa del observador en la barra de la extensión y
   en `/`. Pausado significa pausado: no se encola nada.
7. Los dumps de producción **no se copian al escritorio.**
