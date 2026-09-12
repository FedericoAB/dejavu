/**
 * Banco de evaluacion del detector: precision, recall y F1 sobre trazas
 * etiquetadas a mano. Corre sin red y sin claves.
 *
 *   pnpm eval:detector
 *
 * El numero que imprime es el que hay que poder decir en voz alta frente al
 * jurado. Si baja, algo se rompio.
 */
import { detectRaw } from '../src/index.js'
import type { RawEvent } from '../src/types.js'
import { cobranzasRound, linkedRound, noise, randomBrowsing, resetClock, shortRound } from './fixtures/traces.js'

type Case = { name: string; trace: RawEvent[]; shouldDetect: boolean; expectedLen?: number }

function build(): Case[] {
  const cases: Case[] = []
  const round = (id: string) => {
    const r = cobranzasRound({ id, name: `Cliente ${id}`, total: String(Number(id) * 1000) })
    return r
  }

  // --- positivos (deberia detectar) ---
  cases.push({ name: '2 vueltas identicas', trace: [...(resetClock(), round('1')), ...round('1')], shouldDetect: true, expectedLen: 6 })
  cases.push({ name: '3 vueltas identicas', trace: [...(resetClock(), round('1')), ...round('1'), ...round('1')], shouldDetect: true, expectedLen: 6 })
  cases.push({ name: '2 vueltas, clientes distintos', trace: [...(resetClock(), round('1')), ...round('2')], shouldDetect: true, expectedLen: 6 })
  cases.push({ name: '3 vueltas, clientes distintos', trace: [...(resetClock(), round('1')), ...round('2'), ...round('3')], shouldDetect: true, expectedLen: 6 })
  cases.push({ name: 'ruido intercalado', trace: [...(resetClock(), round('1')), ...noise(5), ...round('2')], shouldDetect: true, expectedLen: 6 })
  cases.push({ name: 'ruido antes y despues', trace: [...(resetClock(), noise(3)), ...round('1'), ...noise(4), ...round('2'), ...noise(2)], shouldDetect: true, expectedLen: 6 })
  cases.push({ name: 'enlace de datos', trace: [...(resetClock(), linkedRound({ id: '1', total: '100' })), ...linkedRound({ id: '2', total: '200' })], shouldDetect: true, expectedLen: 4 })
  cases.push({ name: 'enlace, 3 vueltas', trace: [...(resetClock(), linkedRound({ id: '1', total: '100' })), ...linkedRound({ id: '2', total: '200' }), ...linkedRound({ id: '3', total: '300' })], shouldDetect: true, expectedLen: 4 })
  cases.push({ name: 'dos patrones distintos alternados', trace: [...(resetClock(), round('1')), ...linkedRound({ id: '9', total: '9' }), ...round('2'), ...linkedRound({ id: '8', total: '8' })], shouldDetect: true })
  cases.push({ name: 'vueltas separadas por sesion', trace: [...(resetClock(), round('1')), ...noise(30), ...round('2')], shouldDetect: true, expectedLen: 6 })
  cases.push({ name: '4 vueltas', trace: [...(resetClock(), round('1')), ...round('2'), ...round('3'), ...round('4')], shouldDetect: true, expectedLen: 6 })
  cases.push({ name: 'vuelta con paso extra al final', trace: [...(resetClock(), round('1')), ...round('2'), ...noise(1)], shouldDetect: true, expectedLen: 6 })

  // --- negativos (NO deberia detectar) ---
  cases.push({ name: 'navegacion aleatoria', trace: (resetClock(), randomBrowsing(60)), shouldDetect: false })
  cases.push({ name: 'navegacion repetida sin efecto', trace: [...(resetClock(), noise(6)), ...noise(6)], shouldDetect: false })
  cases.push({ name: 'patron de 2 pasos', trace: [...(resetClock(), shortRound()), ...shortRound(), ...shortRound()], shouldDetect: false })
  cases.push({ name: 'una sola vuelta', trace: (resetClock(), round('1')), shouldDetect: false })
  cases.push({ name: 'traza vacia', trace: [], shouldDetect: false })
  cases.push({ name: 'un solo evento', trace: (resetClock(), round('1')).slice(0, 1), shouldDetect: false })
  cases.push({
    name: 'flujo rapido (< 20 s a mano)',
    trace: (() => {
      resetClock()
      const fast = round('1').map((e, i) => ({ ...e, occurredAt: new Date(Date.parse('2026-09-12T12:00:00Z') + i * 400).toISOString() }))
      const fast2 = fast.map((e, i) => ({ ...e, occurredAt: new Date(Date.parse('2026-09-12T12:00:08Z') + i * 400).toISOString() }))
      return [...fast, ...fast2]
    })(),
    shouldDetect: false,
  })
  cases.push({ name: 'solo lecturas, sin efecto', trace: (() => {
    resetClock()
    const reads = round('1').filter((e) => e.kind === 'sheet.read' || e.kind === 'navigate' || e.kind === 'copy')
    return [...reads, ...reads.map((e, i) => ({ ...e, occurredAt: `2026-09-12T12:3${i}:00.000Z` }))]
  })(), shouldDetect: false })

  return cases
}

const NOW = Date.parse('2026-09-12T13:00:00.000Z')
let tp = 0, fp = 0, fn = 0, tn = 0, lenOk = 0, lenTotal = 0
const rows: string[] = []

for (const c of build()) {
  const detected = detectRaw(c.trace, { now: NOW })
  const hit = detected.length > 0
  if (c.shouldDetect && hit) tp++
  else if (c.shouldDetect && !hit) fn++
  else if (!c.shouldDetect && hit) fp++
  else tn++

  if (c.expectedLen !== undefined && hit) {
    lenTotal++
    if (detected[0].stepKeys.length === c.expectedLen) lenOk++
  }

  const mark = (c.shouldDetect === hit) ? 'ok  ' : 'FALLA'
  rows.push(
    `${mark} ${c.name.padEnd(34)} esperado=${c.shouldDetect ? 'si' : 'no'}  detectado=${hit ? 'si' : 'no'}` +
      (hit ? `  len=${detected[0].stepKeys.length} score=${detected[0].score}` : ''),
  )
}

const precision = tp / (tp + fp || 1)
const recall = tp / (tp + fn || 1)
const f1 = (2 * precision * recall) / (precision + recall || 1)

console.log(rows.join('\n'))
console.log('\n— banco de deteccion —')
console.log(`casos      ${tp + fp + fn + tn}  (positivos ${tp + fn} · negativos ${fp + tn})`)
console.log(`precision  ${precision.toFixed(3)}`)
console.log(`recall     ${recall.toFixed(3)}`)
console.log(`F1         ${f1.toFixed(3)}`)
console.log(`largo del patron correcto  ${lenOk}/${lenTotal}`)

if (fp > 0 || fn > 0) {
  console.error('\nHay casos fallando. No publicar este numero hasta arreglarlos.')
  process.exit(1)
}
