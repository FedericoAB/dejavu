# apps/web

Next.js 15 (App Router) + CopilotKit v2 + SCSS. Plan completo en
[../../docs/plan-frontend.md](../../docs/plan-frontend.md).

## Por hacer (en orden)

- [ ] `styles/tokens.scss` — lo único global
- [ ] `shared/button`, `shared/text-input`, `shared/card`, `shared/skeleton`,
      `shared/empty-state`, `shared/error-state` — cada uno en su carpeta con su `.module.scss`
- [ ] `app/api/copilotkit/route.ts` — runtime
- [ ] `features/copilot/provider.tsx` — `CopilotKitProvider`
- [ ] `features/interrupt/takeover-card.tsx` — **la pieza del video**
- [ ] `features/copilot/tools.ts` — `useHumanInTheLoop`, `useFrontendTool`, `useAgentContext`
- [ ] `features/runs/run-timeline.tsx` — SSE, no polling
- [ ] `features/metrics/dashboard.tsx`
- [ ] los cuatro estados en toda vista que carga datos

## Nota

`TakeoverCard` se renderiza sin CopilotKit. Es deliberado: si la API v2 no coopera,
la interrupción sigue existiendo.
