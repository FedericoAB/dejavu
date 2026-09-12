# Submission — borrador del MVP actual

## Título y descripción

**Déjà Vu — reconoce la repetición y ofrece ayuda**

Déjà Vu ayuda a quien prepara traspasos de tareas dentro de Ambiguous AI. El usuario
copia título y contexto desde dos tareas a sus documentos de traspaso. Al abrir la
siguiente, el detector reconoce la secuencia y ofrece preparar los datos sin escribir
un prompt. El usuario revisa el documento antes de guardarlo y puede rechazarlo.
El sistema verifica el resultado leyéndolo nuevamente desde Ambiguous.

El contexto aporta las tareas reales y sus datos; el resultado queda en el mismo
workspace. Este MVP observa las acciones del panel de una extensión. No observa
cualquier interacción del navegador ni aprende rutinas arbitrarias. Usa una plantilla
fija y un detector determinista; no utiliza un modelo de lenguaje en este corte.

**Tecnología efectivamente usada:** Ambiguous AI REST, Chrome MV3, Node/Express,
TypeScript, Zod, pnpm y Vitest. CopilotKit, Exa, Trigger.dev, Auth0 y any-llm están en
el plan ampliado, no en la implementación que se presenta aquí.

## Evidencia

Ver [revisión del MVP](revision-mvp.md), [demo](demo.md) y
[registro de construcción](que-se-construyo-hoy.md). La evaluación del detector usa
20 trazas sintéticas; no extrapolar su F1 al trabajo real. El ensayo HTTP del proveedor
no reemplaza el ensayo humano de la extensión.

## Entrega pendiente

- [ ] Confirmar ciudad, portal, plazo y período oficial del evento.
- [ ] Confirmar con el equipo qué fue construido durante el período elegible.
- [ ] Ensayar la extensión instalada y mostrar el documento real.
- [ ] Repositorio público y quickstart comprobado desde clon limpio.
- [ ] Video público de ≤2 minutos.
- [ ] Descripción en el portal.
- [ ] Post público con los partners requeridos por el organizador.

## Post preparado para revisión humana

> Construimos Déjà Vu: un asistente que reconoce cuándo repetimos un traspaso de
> tareas en Ambiguous y ofrece preparar el siguiente. Sin prompts, con revisión
> antes de guardar y un documento verificable en el workspace.
>
> Prototipo del hackathon Agents, Everywhere. [Enlace al repo] · [Enlace al video]
> [Etiquetas de partners verificadas en el portal local]

No se publicó ni se envió este borrador. No atribuir uso técnico a un sponsor por
etiquetarlo como partner del evento.
