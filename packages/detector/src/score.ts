import { DETECTOR_CONFIG, type DetectorConfig } from './config.js'
import type { Occurrence, ParamSpec } from './types.js'

export function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2)
}

/** Fraccion de campos observados cuyo valor cambia entre vueltas. Una secuencia
 *  donde *todo* cambia no es una rutina: es navegacion. */
export function paramVariance(params: ParamSpec[]): number {
  if (!params.length) return 0
  const varying = params.filter((p) => p.kind === 'param').length
  return varying / params.length
}

export function scorePattern(input: {
  support: number
  length: number
  medianDurationMs: number
  lastOccurrence: Occurrence
  params: ParamSpec[]
  now?: number
  config?: DetectorConfig
}): number {
  const config = input.config ?? DETECTOR_CONFIG
  const { weights, caps } = config
  const now = input.now ?? Date.now()

  const supportNorm = Math.min(input.support, caps.support) / caps.support
  const lengthNorm = Math.min(input.length, caps.length) / caps.length
  const durationNorm = Math.min(input.medianDurationMs, caps.durationMs) / caps.durationMs
  const hoursSince = Math.max(0, (now - Date.parse(input.lastOccurrence.endedAt)) / 3_600_000)
  const recency = Math.exp(-hoursSince / caps.recencyHalfLifeH)
  // Rodilla en 0.8: penalizar linealmente castigaria rutinas legitimas (casi
  // todo varia entre vueltas, eso es *bueno*). Solo molesta el caso extremo:
  // absolutamente ningun valor estable, sintoma de navegacion disfrazada.
  const variance = Math.max(0, (paramVariance(input.params) - 0.8) / 0.2)

  const score =
    weights.support * supportNorm +
    weights.length * lengthNorm +
    weights.duration * durationNorm +
    weights.recency * recency -
    weights.variance * variance

  return Math.max(0, Math.min(1, Number(score.toFixed(4))))
}
