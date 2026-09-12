import { randomUUID } from 'node:crypto'
import { describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/controllers/api.js'
import type { Document, Page, Pattern, Run, Workspace } from '../src/models/index.js'
import { StateRepository } from '../src/repositories/state.js'
import { Workflow } from '../src/services/workflow.js'

// Datos efímeros de pruebas; nunca se conectan a Ambiguous ni se guardan como dataset.
function fixture() {
  let now = Date.parse('2026-09-12T15:00:00Z')
  const documents = new Map<string, Document>()
  const workspace: Workspace = {
    identity: async () => ({ id: 'test', display_name: 'Prueba', workspace_id: 'test', type: 'agent' }),
    tasks: async () => ({ data: [], meta: { nextCursor: null, hasMore: false } }),
    task: async id => ({ id, title: 'Tarea de prueba', description: null, status: 'todo', priority: 'medium' }),
    createDocument: vi.fn(async draft => { const document = { id: randomUUID(), ...draft }; documents.set(document.id, document); return document }),
    document: async id => documents.get(id)!,
  }
  const workflow = new Workflow(new StateRepository(), workspace, () => now)
  const advance = (ms = 3000) => { now += ms }
  const open = () => workflow.open(randomUUID(), randomUUID())
  const manual = async () => {
    const run = await open()
    advance(); workflow.prepare(run.id, false, { title: run.task.title, description: '' })
    advance(); await workflow.approve(run.id)
    advance()
    return run
  }
  return { workflow, workspace, advance, open, manual }
}

const token = 'dashboard-test-token-with-24-characters'
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
async function serve(workflow: Workflow) {
  const app = createApp(workflow, token)
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`
  return { base, close: async () => {
    app.locals.closeStreams()
    server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  } }
}

function frames(response: Response) {
  const reader = response.body!.getReader()
  const decoder = new TextDecoder()
  let pending = ''
  return async (event: string) => {
    while (true) {
      const boundary = pending.indexOf('\n\n')
      if (boundary >= 0) {
        const frame = pending.slice(0, boundary)
        pending = pending.slice(boundary + 2)
        if (frame.includes(`event: ${event}\n`)) {
          return { id: frame.match(/^id: (.+)$/m)?.[1], data: JSON.parse(frame.match(/^data: (.+)$/m)![1]) }
        }
        continue
      }
      const { value, done } = await reader.read()
      if (done) throw new Error('El stream terminó antes del evento esperado.')
      pending += decoder.decode(value, { stream: true })
    }
  }
}

describe('Tablero con evidencia real', () => {
  it('inicia vacío y declara la receta fija sin presentar un patrón inventado', () => {
    const { workflow, workspace } = fixture()
    expect(workflow.patterns()).toEqual([])
    expect(workflow.routines()).toMatchObject([{ id: 'task-handoff', source: 'fixed-template', requiresApproval: true, estimatedManualMs: null }])
    expect(workflow.metrics()).toEqual({ observedEvents: 0, manualCompleted: 0, assistedCompleted: 0, offered: 0, approved: 0, rejected: 0, dismissed: 0, activeRuns: 0, medianManualDurationMs: null, estimatedSavedMs: null, paused: false })
    expect(workspace.createDocument).not.toHaveBeenCalled()
  })

  it('muestra las dos vueltas verificadas y calcula ahorro estimado solo tras éxito asistido', async () => {
    const { workflow, manual, open, advance } = fixture()
    const first = await manual()
    expect(workflow.patterns()).toEqual([])
    const second = await manual()
    expect(workflow.patterns()).toMatchObject([{ support: 2, medianDurationMs: 6000, occurrences: [{ runId: first.id }, { runId: second.id }] }])
    expect(workflow.metrics().estimatedSavedMs).toBeNull()
    const assisted = await open()
    advance(1000); workflow.prepare(assisted.id, true)
    advance(1000); await workflow.approve(assisted.id)
    expect(workflow.metrics()).toMatchObject({ manualCompleted: 2, assistedCompleted: 1, offered: 1, approved: 3, medianManualDurationMs: 6000, estimatedSavedMs: 4000 })
    expect(workflow.patterns()[0].support).toBe(2)
    const verifiedAt = assisted.verifiedAt
    advance(30000); await workflow.verify(assisted.id)
    expect(assisted.verifiedAt).toBe(verifiedAt)
    expect(workflow.metrics().estimatedSavedMs).toBe(4000)
  })

  it('conserva el conteo de ofertas silenciadas y hace idempotente el descarte', async () => {
    const { workflow, manual, open } = fixture()
    await manual(); await manual()
    const run = await open()
    workflow.dismiss(run.id); workflow.dismiss(run.id); workflow.reject(run.id)
    expect(workflow.metrics()).toMatchObject({ offered: 1, dismissed: 1, rejected: 1, approved: 2 })
    expect(run.offer).toBeUndefined()
    const next = await open()
    expect(next.offer).toBeUndefined()
    expect(() => workflow.dismiss(next.id)).toThrow('No hay una oferta')
  })

  it('no cuenta escrituras sin verificar como evidencia ni cambia el modo de una vista previa', async () => {
    const { workflow, workspace, open, advance } = fixture()
    workspace.document = async () => { throw new Error('Sin conexión') }
    for (let i = 0; i < 2; i++) {
      const run = await open()
      advance(); workflow.prepare(run.id, false, { title: run.task.title, description: '' })
      expect(() => workflow.prepare(run.id, true)).toThrow('otro modo')
      advance(); await workflow.approve(run.id)
    }
    expect(workflow.patterns()).toEqual([])
    expect(workflow.metrics()).toMatchObject({ manualCompleted: 0, approved: 2, medianManualDurationMs: null, estimatedSavedMs: null })
  })
})

describe('API del tablero', () => {
  it('pagina colecciones, conserva state, soporta /api/v1 y aplica errores uniformes', async () => {
    const { workflow, manual } = fixture()
    await manual(); await manual()
    const server = await serve(workflow)
    try {
      const runs = await (await fetch(server.base + '/api/v1/runs?offset=1&limit=1', { headers })).json() as Page<Run>
      expect(runs.data).toHaveLength(1)
      expect(runs.meta).toEqual({ offset: 1, limit: 1, total: 2, hasMore: false })
      const patterns = await (await fetch(server.base + '/v1/patterns', { headers })).json() as Page<Pattern>
      expect(patterns.data[0].support).toBe(2)
      const state = await (await fetch(server.base + '/v1/state', { headers })).json()
      expect(state.metrics.manualCompleted).toBe(2)
      expect((await fetch(server.base + '/v1/routines/task-handoff', { headers })).status).toBe(200)
      expect((await fetch(server.base + '/v1/routines/missing', { headers })).status).toBe(404)
      for (const query of ['limit=201', 'offset=-1', 'limit=0', 'offset=a']) {
        const response = await fetch(server.base + `/v1/runs?${query}`, { headers })
        expect(response.status).toBe(400)
        expect((await response.json()).error).toMatchObject({ code: 'VALIDATION_FAILED', details: [], requestId: expect.any(String) })
      }
    } finally { await server.close() }
  })

  it('permite solo los orígenes exactos y requiere bearer después del preflight', async () => {
    const { workflow } = fixture()
    const server = await serve(workflow)
    try {
      for (const origin of ['http://127.0.0.1:3000', 'http://localhost:3000']) {
        const preflight = await fetch(server.base + '/v1/metrics', { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } })
        expect(preflight.status).toBe(204)
        expect(preflight.headers.get('access-control-allow-origin')).toBe(origin)
        const unauthenticated = await fetch(server.base + '/v1/metrics', { headers: { Origin: origin } })
        expect(unauthenticated.status).toBe(401)
        expect(unauthenticated.headers.get('access-control-allow-origin')).toBe(origin)
      }
      const denied = await fetch(server.base + '/v1/metrics', { headers: { ...headers, Origin: 'http://localhost:3000.evil.example' } })
      expect(denied.status).toBe(403)
      expect(denied.headers.get('access-control-allow-origin')).toBeNull()
      expect((await fetch(server.base + '/v1/metrics', { headers })).status).toBe(200)
      const extensionOrigin = `chrome-extension://${'a'.repeat(32)}`
      const extension = await fetch(server.base + '/v1/metrics', { headers: { ...headers, Origin: extensionOrigin } })
      expect(extension.status).toBe(200)
      expect(extension.headers.get('access-control-allow-origin')).toBeNull()
      expect((await fetch(server.base + '/v1/metrics', { headers: { Origin: extensionOrigin } })).status).toBe(401)
      expect((await fetch(server.base + '/v1/metrics', { headers: { ...headers, Origin: 'chrome-extension://invalid' } })).status).toBe(403)
      expect(() => createApp(workflow, token, { allowedOrigins: ['*'] })).toThrow()
    } finally { await server.close() }
  })

  it('SSE exige bearer, transmite cada transición y recupera el estado vigente al reconectar', async () => {
    const { workflow, open } = fixture()
    const run = await open()
    const server = await serve(workflow)
    const controller = new AbortController()
    try {
      const path = server.base + `/v1/runs/${run.id}/stream`
      expect((await fetch(path + `?token=${token}`)).status).toBe(401)
      expect((await fetch(server.base + `/v1/runs/${randomUUID()}/stream`, { headers })).status).toBe(404)
      const response = await fetch(path, { headers, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]) })
      expect(response.headers.get('content-type')).toContain('text/event-stream')
      const next = frames(response)
      const initial = await next('run')
      expect(initial.data.status).toBe('opened')
      workflow.prepare(run.id, false, { title: run.task.title, description: '' })
      expect((await next('run')).data.status).toBe('waiting_approval')
      await workflow.approve(run.id)
      expect((await next('run')).data.status).toBe('writing')
      expect((await next('run')).data.status).toBe('created')
      const completed = await next('run')
      expect(completed.data.status).toBe('succeeded')
      expect(Number(completed.id)).toBeGreaterThan(Number(initial.id))
      const reconnect = await fetch(path, { headers: { ...headers, 'Last-Event-ID': initial.id! }, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]) })
      expect((await frames(reconnect)('run')).data).toEqual(completed.data)
    } finally { controller.abort(); await server.close() }
  })

  it('el stream global notifica cambios del observador sin polling', async () => {
    const { workflow, open } = fixture()
    const server = await serve(workflow)
    const controller = new AbortController()
    try {
      const response = await fetch(server.base + '/v1/stream', { headers, signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]) })
      const next = frames(response)
      const initial = await next('state')
      expect(initial.data.paused).toBe(false)
      workflow.pause(true)
      const paused = await next('state')
      expect(paused.data.paused).toBe(true)
      expect(Number(paused.id)).toBeGreaterThan(Number(initial.id))
      await open()
      expect(Number((await next('state')).id)).toBeGreaterThan(Number(paused.id))
    } finally { controller.abort(); await server.close() }
  })
})
