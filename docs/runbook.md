---
tipo: plan
ultima_revision: 2026-09-12
---

# Runbook — qué hacer cuando falla (y va a fallar)

Orden de diagnóstico, de lo más probable a lo menos.

## La oferta no aparece

1. ¿Están entrando eventos? `select count(*), max(occurred_at) from events;`
   - No → la extensión. Revisar la consola del *service worker* en `chrome://extensions`,
     y que `CORE_INGEST_TOKEN` coincida. ¿El observador está en pausa?
2. ¿Se están normalizando distinto las dos vueltas?
   `select step_key, count(*) from events group by 1 order by 2 desc;`
   - Si cada vuelta genera `step_key` distintos → el `urlPattern` no está sustituyendo
     los IDs. Es **el bug más común**. Revisar `normalizer.ts`.
3. ¿El patrón está en cooldown? `select status, dismissed_count, last_offered_at from patterns;`
   - `dismissed` o `muted` → `update patterns set status='detected', dismissed_count=0;`
4. ¿El score quedó bajo el umbral? Log `debug` de `detection.ts` imprime el desglose.
5. Último recurso, en vivo: `pnpm seed:demo --pattern cobranzas --repeat 2`.

## Un paso falla

- `401/403` de Ambiguous → clave vencida o sin permiso sobre ese recurso. Reemitir.
- `429` → rate limit. Bajar la frecuencia del watcher a 60 s y no reensayar con envío real.
- `unsupported` → el paso no tiene API. Es esperado: la UI lo muestra como manual.
- Timeout → reintento por paso, hasta 3. Si los tres fallan, la corrida para y avisa;
  no sigue de largo pasos que dependen del que falló.

## La aprobación nunca llega

1. ¿Se creó el waitpoint? Consola de Trigger.dev, la corrida en `waiting_approval`.
2. ¿Auth0 mandó el push? Logs del tenant.
3. Plan B inmediato: `POST /v1/runs/:id/approve` desde la UI (el botón existe siempre,
   aunque esté escondido cuando CIBA está activo).
4. Timeout del waitpoint: 10 min. Después la corrida queda `timeout`, no colgada.

## El LLM no responde

`LLM_PRIMARY` → `LLM_FALLBACK` en `.env`, reiniciar el core. Si ninguno anda: la rutina
se ofrece con nombre genérico y pasos mapeados por plantilla. La detección sigue andando.

## La demo se cae frente al jurado

En este orden, sin dudar:
1. Se corta la demo en vivo a los 20 segundos de pelear. No más.
2. Se muestra el video grabado.
3. Se corre `pnpm test --filter detector` en la terminal: 7 tests verdes, con el número
   de precisión del banco.
4. Se abre `/metrics` con los datos de las corridas anteriores.

Practicar esta transición una vez. Es lo que separa "se les cayó" de "lo tenían previsto".
