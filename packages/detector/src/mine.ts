import { fnv1a } from './hash.js'
import { DETECTOR_CONFIG, type DetectorConfig } from './config.js'
import { EFFECT_KINDS, type EventKind, type NormalizedEvent, type Occurrence } from './types.js'

type Window = { start: number; len: number }

export type RawPattern = {
  fingerprint: string
  stepKeys: string[]
  kinds: EventKind[]
  occurrences: Occurrence[]
}

const isEffect = (kind: EventKind) => (EFFECT_KINDS as readonly string[]).includes(kind)

/** Ocurrencias no solapadas, greedy de izquierda a derecha. Dos vueltas que se
 *  pisan no son dos vueltas. */
function nonOverlapping(positions: number[], len: number): number[] {
  const kept: number[] = []
  let lastEnd = -1
  for (const p of positions.sort((a, b) => a - b)) {
    if (p > lastEnd) {
      kept.push(p)
      lastEnd = p + len - 1
    }
  }
  return kept
}

function toOccurrence(events: NormalizedEvent[], start: number, len: number): Occurrence {
  const slice = events.slice(start, start + len)
  const startedAt = slice[0].occurredAt
  const endedAt = slice[slice.length - 1].occurredAt
  return {
    start,
    end: start + len - 1,
    startedAt,
    endedAt,
    durationMs: Math.max(0, Date.parse(endedAt) - Date.parse(startedAt)),
    values: slice.map((e) => e.values ?? {}),
  }
}

/**
 * Encuentra las subsecuencias contiguas repetidas de la traza.
 *
 * Agrupa ventanas por la secuencia exacta de claves. Recalcula cada firma:
 * O(|S| · maxLen²), no es un hash rodante. El limite de longitud y la cola acotada
 * mantienen pequeno el trabajo; no afirmamos una latencia sin medirla.
 */
export function minePatterns(
  events: NormalizedEvent[],
  config: DetectorConfig = DETECTOR_CONFIG,
): RawPattern[] {
  const keys = events.map((e) => e.stepKey)
  const groups = new Map<string, { window: Window; positions: number[] }>()

  const maxLen = Math.min(config.maxLen, Math.floor(keys.length / config.minSupport))
  for (let len = config.minLen; len <= maxLen; len++) {
    const seen = new Map<string, number[]>()
    for (let start = 0; start + len <= keys.length; start++) {
      const signature = keys.slice(start, start + len).join('|')
      // El hash se conserva solo como identificador del candidato, nunca como
      // prueba de igualdad de dos ventanas.
      const bucket = `${len}:${signature}`
      const list = seen.get(bucket)
      if (list) list.push(start)
      else seen.set(bucket, [start])
    }
    for (const [bucket, positions] of seen) {
      if (positions.length < config.minSupport) continue
      const kept = nonOverlapping(positions, len)
      if (kept.length < config.minSupport) continue
      groups.set(bucket, { window: { start: kept[0], len }, positions: kept })
    }
  }

  // Maximalidad: si P esta contenido en Q y Q no tiene menos soporte, gana Q.
  // Se recorre de mas largo a mas corto y se descarta lo ya cubierto.
  const ordered = [...groups.values()].sort(
    (a, b) => b.window.len - a.window.len || b.positions.length - a.positions.length,
  )
  const covered: Array<{ start: number; end: number; support: number }> = []
  const result: RawPattern[] = []

  for (const group of ordered) {
    const { len } = group.window
    const support = group.positions.length
    const contained = group.positions.every((p) =>
      covered.some((c) => p >= c.start && p + len - 1 <= c.end && c.support >= support),
    )
    if (contained) continue

    const stepKeys = keys.slice(group.positions[0], group.positions[0] + len)
    const kinds = events.slice(group.positions[0], group.positions[0] + len).map((e) => e.kind)

    // Regla dura: sin un paso con efecto no es una rutina, es navegacion.
    if (!kinds.some(isEffect)) continue

    for (const p of group.positions) covered.push({ start: p, end: p + len - 1, support })

    result.push({
      fingerprint: fnv1a(stepKeys.join('|')),
      stepKeys,
      kinds,
      occurrences: group.positions.map((p) => toOccurrence(events, p, len)),
    })
  }

  return result
}
