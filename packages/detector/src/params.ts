import type { Occurrence, ParamSpec } from './types.js'

/**
 * Clasifica cada campo observado de cada paso en constante, parametro o enlace.
 *
 * El tercer caso es el que convierte una grabacion en un programa: si el valor
 * que entra en el paso 4 es el mismo que salio del paso 1 *en la misma vuelta*,
 * no es un parametro del usuario, es un enlace de datos.
 */
export function extractParams(occurrences: Occurrence[], length: number): ParamSpec[] {
  const specs: ParamSpec[] = []

  for (let stepIndex = 0; stepIndex < length; stepIndex++) {
    const fields = new Set<string>()
    for (const occ of occurrences) {
      for (const field of Object.keys(occ.values[stepIndex] ?? {})) fields.add(field)
    }

    for (const field of fields) {
      const values = occurrences.map((occ) => occ.values[stepIndex]?.[field])
      const present = values.filter((v): v is string => typeof v === 'string')
      if (!present.length) continue

      const allEqual = present.every((v) => v === present[0])
      if (allEqual && present.length === occurrences.length) {
        specs.push({ stepIndex, field, kind: 'const', value: present[0] })
        continue
      }

      const link = findLink(occurrences, stepIndex, field)
      if (link) {
        specs.push({ stepIndex, field, kind: 'link', source: link })
        continue
      }

      specs.push({ stepIndex, field, kind: 'param' })
    }
  }

  return specs
}

/** Busca el valor de este campo como salida de un paso anterior, en *todas* las
 *  vueltas. Una sola coincidencia seria casualidad; en todas es una dependencia. */
function findLink(occurrences: Occurrence[], stepIndex: number, field: string): string | undefined {
  const candidates = new Map<string, number>()

  for (const occ of occurrences) {
    const target = occ.values[stepIndex]?.[field]
    if (!target) return undefined
    const matches = new Set<string>()
    for (let prev = 0; prev < stepIndex; prev++) {
      for (const [prevField, prevValue] of Object.entries(occ.values[prev] ?? {})) {
        if (prevValue === target) matches.add(`steps.s${prev + 1}.output.${prevField}`)
      }
    }
    for (const m of matches) candidates.set(m, (candidates.get(m) ?? 0) + 1)
  }

  for (const [source, hits] of candidates) {
    if (hits === occurrences.length) return source
  }
  return undefined
}
