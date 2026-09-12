---
tipo: adr
ultima_revision: 2026-09-12
---
# ADR-0006 — Modelos vía any-llm (Mozilla.ai), Claude por defecto

**Estado:** aceptada · 2026-09-12

## Contexto
Hay un solo punto del sistema que llama a un modelo: el compilador de rutinas. Es un
punto único de falla en una demo en vivo, y la calidad de su salida (nombre en
castellano, parámetros bien inferidos) hay que poder medirla.

## Decisión
Envolver las llamadas con **any-llm** de Mozilla.ai y elegir el proveedor por variable
de entorno: `LLM_PRIMARY=anthropic:claude-opus-5`, `LLM_FAST=anthropic:claude-haiku-4-5-20251001`,
`LLM_FALLBACK=openai:gpt-5.4-mini`. La calidad se evalúa con un banco de 20 trazas
etiquetadas (`scripts/eval-compiler.ts`).

## Consecuencias
- Cambiar de proveedor durante la demo es editar `.env`, no código.
- "El compilador funciona" pasa a ser un número (precisión de nombre, F1 de parámetros)
  que se puede decir frente al jurado.
- Sin modelo disponible, la rutina se ofrece con nombre genérico: **la detección nunca
  depende del LLM**.
