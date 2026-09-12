import { fnv1a } from './hash.js'
import { DETECTOR_CONFIG } from './config.js'
import type { NormalizedEvent, RawEvent } from './types.js'

/** Segmentos que parecen identificador: numero, UUID, hash, slug con digitos. */
const ID_SEGMENT = /^(\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{16,}|[\w-]*\d[\w-]*)$/i

/** Sustituye los identificadores de una ruta por `:id`.
 *  Es la pieza de la que depende todo: sin esto, dos vueltas con clientes
 *  distintos generan pasos distintos y no se detecta nada. */
export function normalizeUrlPattern(pathOrUrl: string): string {
  let path = pathOrUrl
  try {
    if (/^https?:\/\//i.test(pathOrUrl)) path = new URL(pathOrUrl).pathname
  } catch {
    // ruta relativa: se usa tal cual
  }
  const segments = path.split('/').filter(Boolean)
  return '/' + segments.map((s) => (ID_SEGMENT.test(s) ? ':id' : s.toLowerCase())).join('/')
}

/** Normaliza el texto accesible: sin acentos, sin digitos, recortado.
 *  "Enviar reporte a Konecta" y "Enviar reporte a Detez" colapsan al mismo paso. */
export function normalizeLabel(label: string | undefined): string {
  if (!label) return ''
  return label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\d+/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
}

export function buildStepKey(event: RawEvent): string {
  const url = event.locator.urlPattern ? normalizeUrlPattern(event.locator.urlPattern) : ''
  const parts = [event.kind, event.app, url, event.locator.role ?? '', normalizeLabel(event.locator.label)]
  return fnv1a(parts.join('|'))
}

export function normalize(event: RawEvent): NormalizedEvent {
  return { ...event, stepKey: buildStepKey(event) }
}

/** Normaliza el lote y colapsa `navigate` repetidos al mismo destino (rebotes). */
export function normalizeTrace(events: RawEvent[]): NormalizedEvent[] {
  const sorted = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt))
  const out: NormalizedEvent[] = []
  for (const raw of sorted) {
    const ev = normalize(raw)
    const prev = out[out.length - 1]
    if (prev && prev.kind === 'navigate' && ev.kind === 'navigate' && prev.stepKey === ev.stepKey) continue
    out.push(ev)
  }
  return out
}

/** Corta la traza en sesiones por hueco de inactividad. La mineria corre sobre
 *  la traza completa (el patron interesante cruza sesiones), pero las sesiones
 *  sirven para medir duraciones. */
export function sessionize(
  events: NormalizedEvent[],
  idleGapMs: number = DETECTOR_CONFIG.idleGapMs,
): NormalizedEvent[][] {
  const sessions: NormalizedEvent[][] = []
  let current: NormalizedEvent[] = []
  for (const ev of events) {
    const prev = current[current.length - 1]
    if (prev && Date.parse(ev.occurredAt) - Date.parse(prev.occurredAt) > idleGapMs) {
      sessions.push(current)
      current = []
    }
    current.push(ev)
  }
  if (current.length) sessions.push(current)
  return sessions
}
