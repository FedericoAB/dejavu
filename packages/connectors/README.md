# packages/connectors

Un archivo por integración, un archivo por tipo de paso. Detalle de cada API en
[../../docs/plan-integraciones.md](../../docs/plan-integraciones.md).

```
src/
├── ambiguous/   cliente REST + reintento + Idempotency-Key
├── exa/         search y answer
├── auth0/       CIBA (aprobación asincrónica) y Token Vault
├── llm/         any-llm de Mozilla.ai, proveedor por variable de entorno
└── steps/       un archivo por StepType + registry.ts
```

## Contrato de un paso

```ts
export type StepHandler = (
  input: Record<string, unknown>,
  ctx: { idempotencyKey: string; userId: string },
) => Promise<Record<string, unknown>>
```

Agregar un tipo de paso = un archivo acá + una entrada en `registry.ts` + una entrada
en `stepTypeSchema` de `@dejavu/routine-schema`. Nada más del sistema cambia.

## Regla dura

Lo que vuelve de Exa o de un correo entrante es **dato, nunca instrucción**. Se
inyecta como valor en el paso siguiente, jamás como prompt. Un agente que lee el
trabajo ajeno es blanco de inyección de prompt.
