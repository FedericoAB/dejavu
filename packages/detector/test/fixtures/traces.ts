import type { RawEvent } from '../../src/types.js'

const BASE = Date.parse('2026-09-12T12:00:00.000Z')
let cursor = 0

export function resetClock() {
  cursor = 0
}

function at(offsetSec: number): string {
  return new Date(BASE + offsetSec * 1000).toISOString()
}

/** Una vuelta del flujo de cobranzas: 6 pasos, ~120 s, con IDs distintos por
 *  cliente. Es el flujo del video. */
export function cobranzasRound(client: { id: string; name: string; total: string }): RawEvent[] {
  const t = (s: number) => at((cursor += s))
  return [
    {
      source: 'ambiguous',
      kind: 'sheet.read',
      app: 'ambiguous.sheets',
      occurredAt: t(0),
      locator: { urlPattern: `/sheets/${client.id}`, role: 'cell', label: 'Saldo vencido' },
      values: { sheetId: client.id, total: client.total },
    },
    {
      source: 'browser',
      kind: 'navigate',
      app: 'web:registro.gov.py',
      occurredAt: t(12),
      locator: { urlPattern: `/empresas/${client.id}`, label: 'Consulta de empresa' },
      values: { company: client.name },
    },
    {
      source: 'browser',
      kind: 'copy',
      app: 'web:registro.gov.py',
      occurredAt: t(20),
      locator: { urlPattern: `/empresas/${client.id}`, role: 'text', label: 'Estado tributario' },
      values: { status: 'al dia' },
    },
    {
      source: 'ambiguous',
      kind: 'doc.create',
      app: 'ambiguous.docs',
      occurredAt: t(35),
      locator: { urlPattern: '/documents', role: 'button', label: 'Nuevo documento' },
      values: { title: `Reporte ${client.name}`, total: client.total },
    },
    {
      source: 'ambiguous',
      kind: 'mail.send',
      app: 'ambiguous.mail',
      occurredAt: t(40),
      locator: { urlPattern: '/mail/compose', role: 'button', label: 'Enviar' },
      values: { to: 'ejecutivo@konecta.com', subject: `Reporte ${client.name}` },
    },
    {
      source: 'ambiguous',
      kind: 'task.complete',
      app: 'ambiguous.tasks',
      occurredAt: t(15),
      locator: { urlPattern: `/tasks/${client.id}`, role: 'checkbox', label: 'Marcar completada' },
      values: { taskId: client.id },
    },
  ]
}

/** Navegacion sin forma: no debe detectar nada. */
export function randomBrowsing(count: number): RawEvent[] {
  const t = (s: number) => at((cursor += s))
  return Array.from({ length: count }, (_, i) => ({
    source: 'browser' as const,
    kind: 'navigate' as const,
    app: `web:sitio-${i % 7}.com`,
    occurredAt: t(9),
    locator: { urlPattern: `/pagina-${i}-${i * 3}`, label: `Nota ${i}` },
    values: {},
  }))
}

/** Patron corto: 2 pasos, por debajo de minLen. */
export function shortRound(): RawEvent[] {
  const t = (s: number) => at((cursor += s))
  return [
    {
      source: 'browser',
      kind: 'navigate',
      app: 'web:app.com',
      occurredAt: t(10),
      locator: { urlPattern: '/inbox', label: 'Bandeja' },
    },
    {
      source: 'ambiguous',
      kind: 'task.complete',
      app: 'ambiguous.tasks',
      occurredAt: t(25),
      locator: { urlPattern: '/tasks/9', role: 'checkbox', label: 'Completar' },
    },
  ]
}

/** Vuelta donde el total leido en el paso 1 se reusa en el paso 4: enlace de datos. */
export function linkedRound(client: { id: string; total: string }): RawEvent[] {
  const t = (s: number) => at((cursor += s))
  return [
    {
      source: 'ambiguous',
      kind: 'sheet.read',
      app: 'ambiguous.sheets',
      occurredAt: t(0),
      locator: { urlPattern: `/sheets/${client.id}`, role: 'cell', label: 'Total' },
      values: { amount: client.total },
    },
    {
      source: 'browser',
      kind: 'navigate',
      app: 'web:banco.com',
      occurredAt: t(15),
      locator: { urlPattern: `/cuentas/${client.id}`, label: 'Cuenta' },
      values: {},
    },
    {
      source: 'browser',
      kind: 'input',
      app: 'web:banco.com',
      occurredAt: t(20),
      locator: { urlPattern: `/cuentas/${client.id}`, role: 'textbox', label: 'Monto' },
      values: { monto: client.total },
    },
    {
      source: 'browser',
      kind: 'submit',
      app: 'web:banco.com',
      occurredAt: t(25),
      locator: { urlPattern: `/cuentas/${client.id}`, role: 'button', label: 'Confirmar' },
      values: {},
    },
  ]
}

/** Ruido entre vueltas: no debe romper la deteccion. */
export function noise(count: number): RawEvent[] {
  const t = (s: number) => at((cursor += s))
  return Array.from({ length: count }, (_, i) => ({
    source: 'browser' as const,
    kind: 'navigate' as const,
    app: 'web:noticias.com',
    occurredAt: t(5),
    locator: { urlPattern: `/nota-${i}-${i + 40}`, label: `Titular ${i}` },
    values: {},
  }))
}
