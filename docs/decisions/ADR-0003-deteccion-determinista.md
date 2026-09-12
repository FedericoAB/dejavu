---
tipo: adr
ultima_revision: 2026-09-12
---
# ADR-0003 — La detección de patrones es determinista, no un LLM

**Estado:** aceptada · 2026-09-12

## Contexto
La alternativa obvia era pasarle la traza de eventos a un modelo y preguntarle
"¿hay algo repetido acá?".

## Decisión
La detección es un algoritmo: normalización a `stepKey`, minería de subsecuencias
repetidas con hash rodante, puntaje con pesos explícitos. El LLM entra **después**,
solo para nombrar, parametrizar y compilar el candidato.

## Consecuencias
- La demo es reproducible: se hace el flujo dos veces y dispara, siempre.
- La precisión es una métrica medible contra un banco etiquetado, no una impresión.
- Corre en microsegundos: se puede evaluar en cada evento y por eso podemos interrumpir
  en vivo. Un LLM en el camino caliente costaría segundos y varios centavos por evento.
- Los tests del detector no necesitan red ni claves: si se cae internet, seguimos
  pudiendo probar que el producto funciona.
- Contra: no detecta patrones "semánticamente parecidos pero estructuralmente distintos".
  Aceptado: ese no es el caso de uso doloroso.
