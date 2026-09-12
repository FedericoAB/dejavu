export const DETECTOR_CONFIG = {
  /** Un patron de menos de 3 pasos no vale la interrupcion. */
  minLen: 3,
  maxLen: 15,
  /** Se ofrece a la tercera vuelta: hacen falta 2 ocurrencias previas. */
  minSupport: 2,
  /** Corte de sesion. */
  idleGapMs: 90_000,
  /** Si a mano tarda menos que esto, interrumpir molesta mas de lo que ayuda. */
  minManualDurationMs: 20_000,
  scoreThreshold: 0.50,
  weights: {
    support: 0.30,
    length: 0.15,
    duration: 0.30,
    recency: 0.15,
    variance: 0.10, // resta
  },
  /** Techos de normalizacion. */
  caps: {
    support: 4,   // 4 vueltas ya es rutina consolidada; con 2 se ofrece
    length: 8,
    durationMs: 120_000, // 2 min a mano ya es el techo del dolor: no hace falta mas
    recencyHalfLifeH: 24,
  },
} as const

export type DetectorConfig = typeof DETECTOR_CONFIG
