---
tipo: plan
ultima_revision: 2026-09-12
---

# Submission

## Título

**Déjà Vu — el agente que mira cómo trabajás**

## Descripción escrita (borrador para el portal)

> Los agentes de IA esperan que les digas qué hacer. Describir un trabajo repetitivo
> cuesta más que hacerlo, así que nadie lo automatiza y todos lo siguen haciendo a mano.
>
> Déjà Vu invierte la relación: vive dentro de Ambiguous AI —el workspace donde el
> equipo ya tiene su Mail, Chat, Docs, Sheets, Tasks y CRM— y observa el trabajo real.
> Cuando reconoce que una secuencia ya se hizo dos veces, interrumpe una sola vez:
> *"Hiciste esto 2 veces. Son 6 pasos y ~2 minutos cada vez. ¿Lo hago yo?"*. Un clic y
> la ejecuta de punta a punta, pidiendo aprobación humana antes de cualquier paso
> irreversible.
>
> El usuario nunca escribe un prompt. Esa es la idea entera.
>
> La detección **no** es un LLM: es un algoritmo determinista (normalización semántica
> de cada paso + minería de subsecuencias repetidas con hash rodante + puntaje con
> pesos explícitos) que corre en microsegundos sobre cada evento entrante, y por eso
> puede interrumpir en vivo. Tiene un banco etiquetado de 20 trazas con F1 = 1,00 que
> se corre con un comando. El modelo entra después, solo para nombrar la rutina,
> inferir qué varía entre vueltas y compilar el plan ejecutable.
>
> El entorno es esencial dos veces: es donde el trabajo ocurre (lo que nos da qué
> observar) y es donde el agente tiene manos (lo que nos da cómo ejecutar). Como en
> Ambiguous el agente es un miembro del equipo con identidad propia, el reporte llega
> desde su casilla y el equipo le puede contestar.
>
> **Stack:** Ambiguous AI (entorno, observación y ejecución) · CopilotKit + AG-UI
> (interrupción, UI generativa, human-in-the-loop) · Exa (el paso "buscá el dato
> afuera", con citas) · Trigger.dev (corridas durables y el waitpoint de aprobación) ·
> Auth0 for AI Agents (identidad del agente y aprobación asincrónica por CIBA) ·
> Mozilla.ai any-llm (proveedor de modelo intercambiable) · Next.js, Node/TS, Postgres.

## Post en redes (borrador)

> Construimos un agente que no espera órdenes.
>
> Hacés un trabajo repetitivo dos veces. A la tercera aparece: "Hiciste esto 2 veces.
> ¿Lo hago yo?" Un clic y lo ejecuta entero — leyendo tus planillas, buscando el dato
> afuera, redactando el correo y pidiéndote permiso antes de enviarlo.
>
> Cero prompts. El agente reconoce cuándo puede ayudar.
>
> Déjà Vu, hecho hoy en @AIThinkerers con @ambiguous_ai como entorno, @CopilotKit
> para la interrupción, @ExaAILabs para buscar, @triggerdotdev para ejecutar,
> @auth0 para el sí del humano y @MozillaAI para no depender de un solo modelo.
>
> 🔗 [repo] · 🎥 [video]

*(Verificar los handles reales antes de publicar. Etiquetar a los partners del evento
es requisito de la submission, no un detalle.)*

## Checklist de envío

- [ ] Repo **público** en GitHub y pusheado
- [ ] README con instalación que funcione en una máquina limpia
- [ ] Video de **2:00** máximo, subido
- [ ] Descripción pegada en el portal
- [ ] Post publicado, con los partners etiquetados
- [ ] `docs/que-se-construyo-hoy.md` al día (elegibilidad: hay que poder explicar qué
      se construyó durante el evento)
- [ ] `pnpm test` y `pnpm eval:detector` en verde en la última commit
