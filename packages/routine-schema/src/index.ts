import { z } from 'zod'

/**
 * Contrato compartido entre `apps/core` y `apps/web`.
 *
 * Se define UNA vez y el tipo se deriva del esquema: nunca se escribe dos veces.
 * Toda rutina que sale del compilador (LLM) se valida con esto antes de ejecutarse.
 * Un modelo que alucina un tipo de paso inexistente se frena acá, no en produccion.
 */

/** Los seis tipos de paso de la v1. Agregar uno = un archivo en
 *  `connectors/steps/` + una entrada en el registro. Nada mas cambia. */
export const stepTypeSchema = z.enum([
  'exa.search',
  'exa.answer',
  'ambiguous.sheets.read',
  'ambiguous.docs.create',
  'ambiguous.mail.send',
  'ambiguous.tasks.complete',
  'transform',
])
export type StepType = z.infer<typeof stepTypeSchema>

/** Pasos irreversibles: la aprobacion humana es obligatoria en la v1, sin
 *  importar lo que diga el compilador. */
export const IRREVERSIBLE_STEPS: StepType[] = ['ambiguous.mail.send']

export const paramSchema = z.object({
  name: z.string().min(1),
  type: z.enum(['string', 'number', 'date', 'email', 'url']),
  label: z.string().min(1),
  /** Valor propuesto, tomado de la ultima vuelta observada. */
  suggested: z.string().optional(),
  required: z.boolean().default(true),
})
export type Param = z.infer<typeof paramSchema>

export const stepSchema = z.object({
  id: z.string().regex(/^s\d+$/, 'el id de paso es s1, s2, ...'),
  type: stepTypeSchema,
  /** Lo que lee el usuario en la tarjeta de interrupcion. En castellano. */
  title: z.string().min(1).max(120),
  /** Admite plantillas: {{ params.cliente }} · {{ steps.s1.output.total }} */
  input: z.record(z.unknown()).default({}),
  requiresApproval: z.boolean().default(false),
  /** El paso no tiene API detras: se ofrece la rutina igual, avisando. */
  unsupported: z.object({ reason: z.string() }).optional(),
})
export type Step = z.infer<typeof stepSchema>

export const routineSchema = z
  .object({
    id: z.string(),
    name: z.string().min(1).max(80),
    description: z.string().max(400),
    params: z.array(paramSchema).default([]),
    steps: z.array(stepSchema).min(1).max(20),
    /** Mediana medida de lo que tarda a mano. Base del "tiempo ahorrado":
     *  no la estima nadie, sale de las vueltas reales que el detector vio. */
    estimatedManualMs: z.number().int().nonnegative(),
    patternFingerprint: z.string(),
  })
  .superRefine((routine, ctx) => {
    const ids = new Set<string>()
    for (const step of routine.steps) {
      if (ids.has(step.id)) {
        ctx.addIssue({ code: 'custom', message: `id de paso duplicado: ${step.id}`, path: ['steps'] })
      }
      ids.add(step.id)

      if (IRREVERSIBLE_STEPS.includes(step.type) && !step.requiresApproval) {
        ctx.addIssue({
          code: 'custom',
          message: `el paso ${step.id} (${step.type}) es irreversible y debe requerir aprobacion`,
          path: ['steps'],
        })
      }
    }

    // Las plantillas solo pueden referenciar parametros declarados y pasos previos.
    const paramNames = new Set(routine.params.map((p) => p.name))
    routine.steps.forEach((step, index) => {
      const previous = new Set(routine.steps.slice(0, index).map((s) => s.id))
      for (const ref of templateRefs(step.input)) {
        if (ref.startsWith('params.')) {
          const name = ref.slice('params.'.length)
          if (!paramNames.has(name)) {
            ctx.addIssue({ code: 'custom', message: `parametro no declarado: ${name}`, path: ['steps', index] })
          }
        } else if (ref.startsWith('steps.')) {
          const stepId = ref.split('.')[1]
          if (!previous.has(stepId)) {
            ctx.addIssue({
              code: 'custom',
              message: `el paso ${step.id} referencia ${stepId}, que no es un paso anterior`,
              path: ['steps', index],
            })
          }
        }
      }
    })
  })
export type Routine = z.infer<typeof routineSchema>

const TEMPLATE = /\{\{\s*([\w.]+)\s*\}\}/g

/** Extrae las referencias `{{ ... }}` de cualquier valor anidado del input. */
export function templateRefs(value: unknown, found: string[] = []): string[] {
  if (typeof value === 'string') {
    for (const match of value.matchAll(TEMPLATE)) found.push(match[1])
  } else if (Array.isArray(value)) {
    for (const item of value) templateRefs(item, found)
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) templateRefs(item, found)
  }
  return found
}

/** Resuelve las plantillas de un input contra los parametros y las salidas ya
 *  producidas. Sin `eval`: solo lectura de propiedades por camino. */
export function resolveInput(
  input: Record<string, unknown>,
  context: { params: Record<string, unknown>; steps: Record<string, unknown> },
): Record<string, unknown> {
  const walk = (value: unknown): unknown => {
    if (typeof value === 'string') {
      return value.replace(TEMPLATE, (_, path: string) => String(readPath(context, path) ?? ''))
    }
    if (Array.isArray(value)) return value.map(walk)
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, walk(v)]))
    }
    return value
  }
  return walk(input) as Record<string, unknown>
}

function readPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as object)) {
      return (acc as Record<string, unknown>)[key]
    }
    return undefined
  }, root)
}

export const runStatusSchema = z.enum([
  'queued',
  'running',
  'waiting_approval',
  'succeeded',
  'failed',
  'rejected',
  'timeout',
])
export type RunStatus = z.infer<typeof runStatusSchema>
