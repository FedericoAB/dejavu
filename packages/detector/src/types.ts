// Tipos del motor de deteccion. Este paquete es puro: no importa red, base de
// datos ni modelos. Si alguna vez necesita un `fetch`, algo se modelo mal.

/** Accion que tiene efecto sobre el mundo. Un patron sin al menos una de estas
 *  no es una rutina, es navegacion. */
export const EFFECT_KINDS = [
  'submit',
  'mail.send',
  'sheet.write',
  'doc.create',
  'task.complete',
  'upload',
  'download',
] as const

export type EventKind =
  | 'navigate'
  | 'copy'
  | 'paste'
  | 'input'
  | 'click'
  | 'mail.read'
  | 'sheet.read'
  | (typeof EFFECT_KINDS)[number]

export type Locator = {
  urlPattern?: string
  role?: string
  label?: string
}

export type RawEvent = {
  source: 'browser' | 'ambiguous' | 'app'
  kind: EventKind
  occurredAt: string
  app: string
  locator: Locator
  /** Valores ya redactados por el observador. Candidatos a parametro. */
  values?: Record<string, string>
}

export type NormalizedEvent = RawEvent & {
  /** Huella de la *forma* del paso. Los valores no participan. */
  stepKey: string
}

export type ParamKind = 'const' | 'param' | 'link'

export type ParamSpec = {
  stepIndex: number
  field: string
  kind: ParamKind
  /** Solo para 'const': el valor horneado. */
  value?: string
  /** Solo para 'link': de donde sale, p.ej. 'steps.s1.output.total'. */
  source?: string
}

export type Occurrence = {
  start: number
  end: number
  startedAt: string
  endedAt: string
  durationMs: number
  values: Record<string, string>[]
}

export type PatternCandidate = {
  fingerprint: string
  stepKeys: string[]
  kinds: EventKind[]
  occurrences: Occurrence[]
  support: number
  score: number
  medianDurationMs: number
  params: ParamSpec[]
}
