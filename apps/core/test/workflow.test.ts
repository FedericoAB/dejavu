import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Document, Workspace } from '../src/models/index.js'
import { Workflow } from '../src/services/workflow.js'
import { StateRepository } from '../src/repositories/state.js'
import { createApp } from '../src/controllers/api.js'

function fixture(path?: string) {
  let now = Date.parse('2026-09-12T15:00:00Z')
  const documents = new Map<string, Document>()
  const workspace: Workspace = {
    identity: async () => ({ id: 'agent', type: 'agent', display_name: 'Prueba', workspace_id: 'demo' }),
    tasks: async () => ({ data: [], meta: { hasMore: false, nextCursor: null } }),
    task: async id => ({ id, title: `Tarea ${id}`, description: 'Contexto de prueba', status: 'todo', priority: 'medium' }),
    createDocument: vi.fn(async draft => { const doc = { id: randomUUID(), ...draft }; documents.set(doc.id, doc); return doc }),
    document: vi.fn(async id => { const doc = documents.get(id); if (!doc) throw new Error('404'); return doc }),
  }
  const repository = new StateRepository(path)
  const workflow = new Workflow(repository, workspace, () => now)
  const advance = (ms = 3000) => { now += ms }
  const manual = async () => {
    const run = await workflow.open(randomUUID(), randomUUID())
    advance(); workflow.prepare(run.id, false, { title: run.task.title, description: run.task.description ?? '' }); advance(); await workflow.approve(run.id); advance()
    return run
  }
  return { workflow, workspace, repository, advance, manual }
}
const paths: string[] = []
afterEach(() => { for (const path of paths.splice(0)) rmSync(path, { recursive: true, force: true }) })

describe('MVP contextual', () => {
  it('dos vueltas reales verificadas ofrecen la tercera y la asistida no entrena al detector', async () => {
    const { workflow, manual, workspace, advance } = fixture()
    expect((await manual()).offer).toBeUndefined()
    expect((await manual()).offer).toBeUndefined()
    const run = await workflow.open(randomUUID(), randomUUID())
    expect(run.offer?.support).toBe(2)
    expect(run.offer?.medianDurationMs).toBe(6000)
    advance(); workflow.prepare(run.id, true)
    expect(run.draft?.content).toContain(run.task.id)
    expect(workspace.createDocument).toHaveBeenCalledTimes(2)
    await workflow.approve(run.id)
    expect(run.status).toBe('succeeded')
    expect(workflow.state.events).toHaveLength(6)
  })
  it('no ofrece navegación, una vuelta o repeticiones demasiado rápidas', async () => {
    const { workflow } = fixture()
    for (let i = 0; i < 3; i++) {
      const run = await workflow.open(randomUUID(), randomUUID())
      expect(run.offer).toBeUndefined()
      workflow.prepare(run.id, false, { title: run.task.title, description: run.task.description ?? '' })
      await workflow.approve(run.id)
    }
  })
  it('rechazar no escribe ni conserva una vuelta incompleta', async () => {
    const { workflow, workspace } = fixture()
    const run = await workflow.open(randomUUID(), randomUUID())
    workflow.prepare(run.id, false, { title: run.task.title, description: run.task.description ?? '' }); workflow.reject(run.id)
    await expect(workflow.approve(run.id)).rejects.toThrow()
    expect(workspace.createDocument).not.toHaveBeenCalled()
    expect(workflow.state.events).toHaveLength(0)
  })
  it('bloquea aprobación anticipada y doble clic concurrente, permite leer el resultado repetido', async () => {
    const { workflow, workspace } = fixture()
    const run = await workflow.open(randomUUID(), randomUUID())
    await expect(workflow.approve(run.id)).rejects.toThrow()
    workflow.prepare(run.id, false, { title: run.task.title, description: run.task.description ?? '' })
    await Promise.allSettled([workflow.approve(run.id), workflow.approve(run.id)])
    await workflow.approve(run.id)
    expect(workspace.createDocument).toHaveBeenCalledTimes(1)
    expect(run.status).toBe('succeeded')
  })
  it('un resultado incierto nunca reintenta el POST, tampoco después de reiniciar', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dejavu-test-')); paths.push(dir)
    const path = join(dir, 'state.json')
    const { workflow, workspace } = fixture(path)
    vi.mocked(workspace.createDocument).mockRejectedValue(new Error('timeout'))
    const run = await workflow.open(randomUUID(), randomUUID())
    workflow.prepare(run.id, false, { title: run.task.title, description: run.task.description ?? '' }); await workflow.approve(run.id)
    expect(run.status).toBe('uncertain')
    const restarted = new Workflow(new StateRepository(path), workspace)
    await expect(restarted.approve(run.id)).rejects.toThrow()
    expect(workspace.createDocument).toHaveBeenCalledTimes(1)
  })
  it('recupera writing como incierto y conserva created para verificar', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'dejavu-test-')); paths.push(dir)
    const path = join(dir, 'state.json')
    const { workflow, repository } = fixture(path)
    const run = await workflow.open(randomUUID(), randomUUID())
    workflow.prepare(run.id, false, { title: run.task.title, description: run.task.description ?? '' }); run.status = 'writing'; repository.save()
    expect(new StateRepository(path).state.runs[0].status).toBe('uncertain')
  })
  it('una lectura fallida se recupera sin recrear el documento ni duplicar eventos', async () => {
    const { workflow, workspace } = fixture()
    vi.mocked(workspace.document).mockRejectedValueOnce(new Error('offline'))
    const run = await workflow.open(randomUUID(), randomUUID())
    workflow.prepare(run.id, false, { title: run.task.title, description: run.task.description ?? '' }); await workflow.approve(run.id)
    expect(run.status).toBe('created')
    await workflow.verify(run.id); await workflow.verify(run.id)
    expect(run.status).toBe('succeeded')
    expect(workspace.createDocument).toHaveBeenCalledTimes(1)
    expect(workflow.state.events).toHaveLength(3)
  })
  it('no verifica como éxito un documento con otro origen', async () => {
    const { workflow, workspace } = fixture()
    const run = await workflow.open(randomUUID(), randomUUID())
    workflow.prepare(run.id, false, { title: run.task.title, description: run.task.description ?? '' })
    vi.mocked(workspace.document).mockImplementation(async id => ({ id, title: run.draft!.title, content: 'otro origen' }))
    await workflow.approve(run.id)
    expect(run.status).toBe('created'); expect(run.error).toBeTruthy()
  })
  it('silenciar dura 24 horas y pausar descarta la secuencia', async () => {
    const { workflow, manual } = fixture()
    await manual(); await manual()
    const run = await workflow.open(randomUUID(), randomUUID())
    workflow.dismiss(run.id); workflow.reject(run.id)
    const next = await workflow.open(randomUUID(), randomUUID())
    expect(next.offer).toBeUndefined()
    workflow.reject(next.id); workflow.pause(true)
    await manual(); expect(workflow.state.events).toHaveLength(0)
  })
  it('rechaza usar una clave de otra tarea y bloquea corridas simultáneas', async () => {
    const { workflow } = fixture()
    const taskId = randomUUID(), id = randomUUID()
    await workflow.open(taskId, id)
    expect((await workflow.open(taskId, id)).id).toBe(id)
    await expect(workflow.open(randomUUID(), id)).rejects.toThrow()
    await expect(workflow.open(randomUUID(), randomUUID())).rejects.toThrow()
  })
})

it('HTTP: exige token, valida el cuerpo y nunca acepta una aprobación falsa', async () => {
  const { workflow, workspace } = fixture()
  const token = 'local-test-token-with-24-characters'
  const server = createApp(workflow, token).listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const address = server.address() as { port: number }
  const base = `http://127.0.0.1:${address.port}`
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
  try {
    expect((await fetch(base + '/v1/state')).status).toBe(401)
    const invalid = await fetch(base + '/v1/runs', { method: 'POST', headers, body: '{}' })
    expect(invalid.status).toBe(400)
    expect((await invalid.json()).error).toMatchObject({ code: 'VALIDATION_FAILED', details: [], requestId: expect.any(String) })
    const run = await workflow.open(randomUUID(), randomUUID()); workflow.prepare(run.id, false, { title: run.task.title, description: run.task.description ?? '' })
    const denied = await fetch(base + `/v1/runs/${run.id}/approve`, { method: 'POST', headers, body: '{"approved":false}' })
    expect(denied.status).toBe(400); expect(workspace.createDocument).not.toHaveBeenCalled()
    const state = await (await fetch(base + '/v1/state', { headers })).json()
    expect(state.meta).toMatchObject({ offset: 0, limit: 20, total: 1 })
    expect((await fetch(base + '/v1/state?offset=-1', { headers })).status).toBe(400)
  } finally { await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve())) }
})
