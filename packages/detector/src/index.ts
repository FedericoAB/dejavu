import { DETECTOR_CONFIG, type DetectorConfig } from './config.js'
import { minePatterns } from './mine.js'
import { normalizeTrace, sessionize } from './normalize.js'
import { extractParams } from './params.js'
import { median, scorePattern } from './score.js'
import type { NormalizedEvent, PatternCandidate, RawEvent } from './types.js'

export * from './types.js'
export { DETECTOR_CONFIG } from './config.js'
export { buildStepKey, normalize, normalizeLabel, normalizeTrace, normalizeUrlPattern, sessionize } from './normalize.js'
export { minePatterns } from './mine.js'
export { extractParams } from './params.js'
export { median, paramVariance, scorePattern } from './score.js'

export type DetectOptions = {
  config?: DetectorConfig
  /** Inyectable para que los tests no dependan del reloj. */
  now?: number
}

/**
 * Punto de entrada del motor. Traza de eventos ya normalizados -> candidatos
 * ordenados por puntaje, listos para ofrecer.
 *
 * Deliberadamente sincrono y puro: corre en el camino caliente de la ingesta.
 */
export function detect(events: NormalizedEvent[], options: DetectOptions = {}): PatternCandidate[] {
  const config = options.config ?? DETECTOR_CONFIG
  const now = options.now ?? Date.now()

  const candidates: PatternCandidate[] = []

  for (const pattern of minePatterns(events, config)) {
    const length = pattern.stepKeys.length
    const params = extractParams(pattern.occurrences, length)
    const durations = pattern.occurrences.map((o) => o.durationMs)
    const medianDurationMs = median(durations)

    // No vale interrumpir por algo que a mano cuesta menos que el clic.
    if (medianDurationMs < config.minManualDurationMs) continue

    const score = scorePattern({
      support: pattern.occurrences.length,
      length,
      medianDurationMs,
      lastOccurrence: pattern.occurrences[pattern.occurrences.length - 1],
      params,
      now,
      config,
    })

    if (score < config.scoreThreshold) continue

    candidates.push({
      fingerprint: pattern.fingerprint,
      stepKeys: pattern.stepKeys,
      kinds: pattern.kinds,
      occurrences: pattern.occurrences,
      support: pattern.occurrences.length,
      score,
      medianDurationMs,
      params,
    })
  }

  return candidates.sort((a, b) => b.score - a.score)
}

/** Atajo para cuando la traza viene cruda (desde la ingesta). */
export function detectRaw(events: RawEvent[], options: DetectOptions = {}): PatternCandidate[] {
  return detect(normalizeTrace(events), options)
}

/** Duracion mediana de la sesion mas larga; sirve de referencia al depurar. */
export function traceStats(events: NormalizedEvent[]) {
  const sessions = sessionize(events)
  return {
    events: events.length,
    sessions: sessions.length,
    distinctSteps: new Set(events.map((e) => e.stepKey)).size,
  }
}
