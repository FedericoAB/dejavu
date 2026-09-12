import { describe, expect, it, beforeEach } from 'vitest'
import { detectRaw, normalizeTrace, normalizeUrlPattern, normalizeLabel, buildStepKey } from '../src/index.js'
import {
  cobranzasRound,
  linkedRound,
  noise,
  randomBrowsing,
  resetClock,
  shortRound,
} from './fixtures/traces.js'

// Reloj fijo: la recencia no puede depender de cuando corren los tests.
const NOW = Date.parse('2026-09-12T13:00:00.000Z')

beforeEach(() => resetClock())

describe('normalizacion', () => {
  it('sustituye identificadores de la ruta por :id', () => {
    expect(normalizeUrlPattern('/clientes/4821/facturas/993')).toBe('/clientes/:id/facturas/:id')
    expect(normalizeUrlPattern('https://app.com/sheets/9f8c1d2e-1111-2222-3333-444455556666/edit')).toBe(
      '/sheets/:id/edit',
    )
  })

  it('normaliza el label: sin acentos, sin digitos, recortado', () => {
    expect(normalizeLabel('Enviar Reporte a Konecta 2026')).toBe('enviar reporte a konecta')
    expect(normalizeLabel(undefined)).toBe('')
  })

  it('da la misma clave a dos vueltas con clientes distintos', () => {
    const a = cobranzasRound({ id: '101', name: 'Konecta', total: '4500000' })
    resetClock()
    const b = cobranzasRound({ id: '202', name: 'Detez', total: '990000' })
    expect(a.map(buildStepKey)).toEqual(b.map(buildStepKey))
  })

  it('colapsa navigate repetidos al mismo destino', () => {
    const events = normalizeTrace([
      ...randomBrowsing(1),
      ...randomBrowsing(1).map((e) => ({ ...e, occurredAt: '2026-09-12T12:00:05.000Z' })),
    ])
    expect(events.length).toBeLessThanOrEqual(2)
  })
})

describe('deteccion', () => {
  it('detecta el patron tras 2 vueltas identicas de 6 pasos', () => {
    const trace = [
      ...cobranzasRound({ id: '101', name: 'Konecta', total: '4500000' }),
      ...cobranzasRound({ id: '101', name: 'Konecta', total: '4500000' }),
    ]
    const [candidate, ...rest] = detectRaw(trace, { now: NOW })

    expect(candidate).toBeDefined()
    expect(candidate.support).toBe(2)
    expect(candidate.stepKeys).toHaveLength(6)
    expect(candidate.score).toBeGreaterThanOrEqual(0.55)
    expect(rest).toHaveLength(0)
  })

  it('sube el soporte a 3 con tres vueltas', () => {
    const trace = [
      ...cobranzasRound({ id: '101', name: 'Konecta', total: '4500000' }),
      ...cobranzasRound({ id: '101', name: 'Konecta', total: '4500000' }),
      ...cobranzasRound({ id: '101', name: 'Konecta', total: '4500000' }),
    ]
    expect(detectRaw(trace, { now: NOW })[0].support).toBe(3)
  })

  it('marca como parametro lo que cambia entre vueltas', () => {
    const trace = [
      ...cobranzasRound({ id: '101', name: 'Konecta', total: '4500000' }),
      ...cobranzasRound({ id: '202', name: 'Detez', total: '990000' }),
    ]
    const [candidate] = detectRaw(trace, { now: NOW })

    const params = candidate.params.filter((p) => p.kind === 'param')
    const consts = candidate.params.filter((p) => p.kind === 'const')
    const links = candidate.params.filter((p) => p.kind === 'link')

    // entran de afuera: sheetId, total leido, company, title del documento
    expect(params).toHaveLength(4)
    // no cambian nunca: el destinatario del correo y el estado consultado
    expect(consts.map((c) => c.value)).toContain('ejecutivo@konecta.com')
    // se derivan de un paso anterior, no son parametros del usuario:
    // el total del documento, el asunto del correo y el id de la tarea
    expect(links).toHaveLength(3)
    expect(links.map((l) => l.source)).toContain('steps.s1.output.total')
  })

  it('detecta el enlace de datos: la salida del paso 1 entra en el paso 3', () => {
    const trace = [
      ...linkedRound({ id: '101', total: '4500000' }),
      ...linkedRound({ id: '202', total: '990000' }),
    ]
    const [candidate] = detectRaw(trace, { now: NOW })

    const link = candidate.params.find((p) => p.kind === 'link')
    expect(link).toBeDefined()
    expect(link!.source).toBe('steps.s1.output.amount')
    expect(link!.stepIndex).toBe(2)
  })

  it('no inventa patrones sobre navegacion aleatoria', () => {
    expect(detectRaw(randomBrowsing(60), { now: NOW })).toHaveLength(0)
  })

  it('ignora patrones mas cortos que minLen', () => {
    const trace = [...shortRound(), ...shortRound(), ...shortRound()]
    expect(detectRaw(trace, { now: NOW })).toHaveLength(0)
  })

  it('descarta secuencias sin ningun paso con efecto', () => {
    const sinEfecto = randomBrowsing(4)
    const trace = [...sinEfecto, ...sinEfecto.map((e, i) => ({ ...e, occurredAt: `2026-09-12T12:1${i}:00.000Z` }))]
    expect(detectRaw(trace, { now: NOW })).toHaveLength(0)
  })

  it('sigue detectando con ruido intercalado entre vueltas', () => {
    const trace = [
      ...cobranzasRound({ id: '101', name: 'Konecta', total: '4500000' }),
      ...noise(5),
      ...cobranzasRound({ id: '202', name: 'Detez', total: '990000' }),
    ]
    const [candidate] = detectRaw(trace, { now: NOW })
    expect(candidate).toBeDefined()
    expect(candidate.support).toBe(2)
    expect(candidate.stepKeys).toHaveLength(6)
  })

  it('prefiere el patron maximal cuando el soporte empata', () => {
    const trace = [
      ...cobranzasRound({ id: '101', name: 'Konecta', total: '4500000' }),
      ...cobranzasRound({ id: '202', name: 'Detez', total: '990000' }),
    ]
    const candidates = detectRaw(trace, { now: NOW })
    // el de 6 pasos gana; el sub-patron de 3 pasos con el mismo soporte no se ofrece
    expect(candidates).toHaveLength(1)
    expect(candidates[0].stepKeys).toHaveLength(6)
  })

  it('no interrumpe por algo que a mano cuesta menos de 20 s', () => {
    const rapido = cobranzasRound({ id: '101', name: 'Konecta', total: '1' }).map((e, i) => ({
      ...e,
      occurredAt: new Date(Date.parse('2026-09-12T12:00:00.000Z') + i * 500).toISOString(),
    }))
    const trace = [
      ...rapido,
      ...rapido.map((e, i) => ({
        ...e,
        occurredAt: new Date(Date.parse('2026-09-12T12:00:10.000Z') + i * 500).toISOString(),
      })),
    ]
    expect(detectRaw(trace, { now: NOW })).toHaveLength(0)
  })

  it('corre en menos de 50 ms sobre 2000 eventos (camino caliente)', () => {
    const trace = Array.from({ length: 40 }, (_, i) => {
      resetClock()
      return cobranzasRound({ id: String(i), name: `Cliente ${i}`, total: String(i * 1000) })
    }).flat()
    const started = performance.now()
    detectRaw(trace, { now: NOW })
    expect(performance.now() - started).toBeLessThan(50)
  })
})
