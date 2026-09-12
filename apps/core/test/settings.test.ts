import { randomUUID } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseEnv } from 'node:util'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp } from '../src/controllers/api.js'
import { DomainError } from '../src/errors/index.js'
import type { Document, SettingsState, Workspace } from '../src/models/index.js'
import { FileSettingsRepository } from '../src/repositories/settings.js'
import { LocalRuntime } from '../src/services/settings.js'

const token = 'settings-original-test-token-1234'
const newToken = 'settings-replacement-test-token-5678'
const keyA = 'ak_settings_test_workspace_a'
const keyB = 'ak_settings_test_workspace_b'
const cleanup: (() => void)[] = []
afterEach(() => { for (const clean of cleanup.splice(0).reverse()) clean() })

function fixture(initialKey?: string) {
  const directory = mkdtempSync(join(tmpdir(), 'dejavu-settings-test-'))
  cleanup.push(() => rmSync(directory, { recursive: true, force: true }))
  const envPath = join(directory, '.env')
  const source = `# Configuración de prueba\nCORE_PORT=8123\nCORE_INGEST_TOKEN=${token}\nAMBIGUOUS_API_KEY=${initialKey ?? ''}\nOTHER="primera línea\nCORE_INGEST_TOKEN=no-es-un-token-real\ntercera línea"\n`
  writeFileSync(envPath, source, { mode: 0o644 })
  const documents = new Map<string, Document>()
  const makeWorkspace = vi.fn((key: string): Workspace => ({
    identity: vi.fn(async () => ({ id: 'agent-test', workspace_id: key === keyB ? 'workspace-b' : 'workspace-a', display_name: 'Agente de prueba', type: 'agent' })),
    tasks: async () => ({ data: [], meta: { hasMore: false, nextCursor: null } }),
    task: async id => ({ id, title: 'Tarea efímera', description: '', status: 'todo', priority: 'medium' }),
    createDocument: vi.fn(async draft => { const document = { id: randomUUID(), ...draft }; documents.set(document.id, document); return document }),
    document: async id => documents.get(id)!,
  }))
  const repository = new FileSettingsRepository(envPath)
  const options = { token, ambiguousApiKey: initialKey, dataDirectory: directory, settingsRepository: repository, workspace: makeWorkspace }
  const runtime = new LocalRuntime(options)
  cleanup.push(() => runtime.close())
  return { runtime, options, repository, envPath, directory, source, makeWorkspace }
}

async function serve(runtime: LocalRuntime) {
  const app = createApp(() => runtime.workflow, () => runtime.token, { settings: runtime })
  const server = app.listen(0, '127.0.0.1')
  await new Promise<void>(resolve => server.once('listening', resolve))
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/v1`
  return { base, close: async () => {
    app.locals.closeStreams(); server.closeAllConnections()
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))
  } }
}
const headers = (bearer = token) => ({ Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' })

describe('Configuración privada en caliente', () => {
  it('arranca sin Ambiguous y expone solo metadata autenticada', async () => {
    const { runtime, makeWorkspace } = fixture()
    await runtime.initialize()
    expect(makeWorkspace).not.toHaveBeenCalled()
    expect(runtime.get()).toEqual({ ambiguous: { configured: false, connected: false, identity: null }, core: { tokenConfigured: true, minTokenLength: 24 } })
    await expect(runtime.workflow.workspace.tasks()).rejects.toMatchObject({ code: 'NOT_CONFIGURED' })
    const server = await serve(runtime)
    try {
      expect((await fetch(server.base + '/settings')).status).toBe(401)
      const response = await fetch(server.base + '/settings', { headers: headers() })
      expect(response.status).toBe(200)
      expect(await response.json()).toEqual(runtime.get())
      expect((await fetch(server.base + '/workspace', { headers: headers() })).status).toBe(503)
    } finally { await server.close() }
  })

  it('una clave inválida al arrancar deja disponible Configuración para corregirla', async () => {
    const { runtime, makeWorkspace } = fixture(keyA)
    makeWorkspace.mockImplementation(() => { throw new Error('Falla de conexión con información privada') })
    await runtime.initialize()
    expect(runtime.get().ambiguous).toMatchObject({ configured: true, connected: false, identity: null })
    expect(runtime.get().ambiguous.error).toBe('No se pudo validar Ambiguous. Revisá la clave, los permisos y la conexión desde Configuración.')
    expect(JSON.stringify(runtime.get())).not.toContain(keyA)
  })

  it('recupera una falla temporal con la clave guardada sin reescribir .env ni devolver secretos', async () => {
    const { runtime, makeWorkspace, envPath, source, repository } = fixture(keyA)
    makeWorkspace.mockImplementationOnce(() => { throw new Error('Sin conexión durante el arranque') })
    await runtime.initialize()
    expect(runtime.get().ambiguous.connected).toBe(false)
    const save = vi.spyOn(repository, 'save')
    const server = await serve(runtime)
    try {
      expect((await fetch(server.base + '/settings/check', { method: 'POST' })).status).toBe(401)
      const response = await fetch(server.base + '/settings/check', { method: 'POST', headers: headers(), body: '{}' })
      expect(response.status).toBe(200)
      const content = await response.text()
      expect(JSON.parse(content).ambiguous).toEqual({ configured: true, connected: true, identity: { id: 'agent-test', workspace_id: 'workspace-a', display_name: 'Agente de prueba', type: 'agent' } })
      expect(content).not.toContain(keyA)
      expect(content).not.toContain(token)
      expect(save).not.toHaveBeenCalled()
      expect(readFileSync(envPath, 'utf8')).toBe(source)
      const run = await runtime.workflow.open(randomUUID(), randomUUID())
      expect((await fetch(server.base + '/settings/check', { method: 'POST', headers: headers(), body: '{}' })).status).toBe(409)
      expect(runtime.workflow.get(run.id).status).toBe('opened')
    } finally { await server.close() }
  })

  it('un check fallido refleja desconexión sin perder historial ni lock y otro exitoso la recupera', async () => {
    const { runtime, makeWorkspace, directory, envPath, source } = fixture(keyA)
    await runtime.initialize()
    const run = await runtime.workflow.open(randomUUID(), randomUUID())
    runtime.workflow.reject(run.id)
    const previous = runtime.workflow
    makeWorkspace.mockImplementationOnce(() => ({ ...previous.workspace, identity: async () => { throw new Error('Sin conexión') } }))
    await expect(runtime.check()).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    expect(runtime.get().ambiguous).toMatchObject({ configured: true, connected: false, identity: { workspace_id: 'workspace-a' }, error: expect.any(String) })
    expect(runtime.workflow).toBe(previous)
    expect(runtime.workflow.get(run.id).status).toBe('rejected')
    expect(existsSync(join(directory, 'state-workspace-a-agent-test.json.lock'))).toBe(true)
    expect(readFileSync(envPath, 'utf8')).toBe(source)
    const recovered = await runtime.check()
    expect(recovered.ambiguous.connected).toBe(true)
    expect(recovered.ambiguous.error).toBeUndefined()
    expect(runtime.workflow.get(run.id).status).toBe('rejected')
    expect(existsSync(join(directory, 'state-workspace-a-agent-test.json.lock'))).toBe(true)
  })

  it('valida identidad por lectura, preserva variables/comentarios/multilínea y guarda .env con modo 0600', async () => {
    const { runtime, envPath, source, directory, makeWorkspace } = fixture()
    const result = await runtime.update({ ambiguousApiKey: keyA, coreToken: newToken })
    expect(result).toMatchObject({ tokenChanged: true, workspaceChanged: true, settings: { ambiguous: { configured: true, connected: true, identity: { workspace_id: 'workspace-a' } } } })
    expect(JSON.stringify(result)).not.toContain(keyA)
    expect(JSON.stringify(result)).not.toContain(newToken)
    const stored = readFileSync(envPath, 'utf8')
    expect(stored).toContain('# Configuración de prueba\nCORE_PORT=8123')
    expect(parseEnv(stored)).toEqual({ ...parseEnv(source), AMBIGUOUS_API_KEY: keyA, CORE_INGEST_TOKEN: newToken })
    expect(statSync(envPath).mode & 0o777).toBe(0o600)
    expect(readdirSync(directory).filter(name => name.endsWith('.tmp'))).toEqual([])
    expect(makeWorkspace.mock.results[0].value.identity).toHaveBeenCalledTimes(1)
    expect(makeWorkspace.mock.results[0].value.createDocument).not.toHaveBeenCalled()
  })

  it('un fallo de identidad no cambia el archivo, el token, el workspace ni los streams', async () => {
    const { runtime, envPath, makeWorkspace } = fixture(keyA)
    await runtime.initialize()
    const before = readFileSync(envPath, 'utf8'), previous = runtime.workflow, notified = vi.fn()
    runtime.subscribe(notified)
    makeWorkspace.mockImplementationOnce(() => ({ ...previous.workspace, identity: async () => { throw new Error(keyB) } }))
    await expect(runtime.update({ ambiguousApiKey: keyB, coreToken: newToken })).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    expect(readFileSync(envPath, 'utf8')).toBe(before)
    expect(runtime.token).toBe(token)
    expect(runtime.workflow).toBe(previous)
    expect(runtime.get().ambiguous.connected).toBe(true)
    expect(runtime.get().ambiguous.error).toBeUndefined()
    expect(notified).not.toHaveBeenCalled()
  })

  it('un fallo de persistencia revierte el cambio de runtime y libera el lock nuevo', async () => {
    const { runtime, repository, directory } = fixture(keyA)
    await runtime.initialize()
    const previous = runtime.workflow
    vi.spyOn(repository, 'save').mockImplementation(() => { throw new DomainError('CONFIGURATION_ERROR', 'No se pudo guardar.') })
    await expect(runtime.update({ ambiguousApiKey: keyB, coreToken: newToken })).rejects.toMatchObject({ code: 'CONFIGURATION_ERROR' })
    expect(runtime.workflow).toBe(previous)
    expect(runtime.token).toBe(token)
    expect(existsSync(join(directory, 'state-workspace-a-agent-test.json.lock'))).toBe(true)
    expect(existsSync(join(directory, 'state-workspace-b-agent-test.json.lock'))).toBe(false)
  })

  it('bloquea cambios de proveedor con corrida abierta y vuelve a comprobar tras validar identidad', async () => {
    const { runtime, makeWorkspace, envPath } = fixture(keyA)
    await runtime.initialize()
    const run = await runtime.workflow.open(randomUUID(), randomUUID())
    await expect(runtime.update({ ambiguousApiKey: keyB })).rejects.toMatchObject({ code: 'CONFLICT' })
    runtime.workflow.reject(run.id)
    let release!: () => void
    makeWorkspace.mockImplementationOnce(() => ({ ...runtime.workflow.workspace, identity: () => new Promise(resolve => {
      release = () => resolve({ id: 'agent-test', workspace_id: 'workspace-b', display_name: 'Agente de prueba', type: 'agent' })
    }) }))
    const updating = runtime.update({ ambiguousApiKey: keyB })
    const next = await runtime.workflow.open(randomUUID(), randomUUID())
    release()
    await expect(updating).rejects.toMatchObject({ code: 'CONFLICT' })
    expect(runtime.workflow.get(next.id).status).toBe('opened')
    expect(parseEnv(readFileSync(envPath, 'utf8')).AMBIGUOUS_API_KEY).toBe(keyA)
  })

  it('cambia de workspace con locks exclusivos y conserva el historial anterior', async () => {
    const { runtime, directory, options } = fixture(keyA)
    await runtime.initialize()
    const competing = new LocalRuntime(options)
    cleanup.push(() => competing.close())
    await expect(competing.initialize()).rejects.toMatchObject({ code: 'CONFLICT' })
    const run = await runtime.workflow.open(randomUUID(), randomUUID())
    runtime.workflow.reject(run.id)
    const changed = await runtime.update({ ambiguousApiKey: keyB })
    expect(changed.workspaceChanged).toBe(true)
    expect(runtime.workflow.state.runs).toEqual([])
    expect(existsSync(join(directory, 'state-workspace-a-agent-test.json.lock'))).toBe(false)
    expect(existsSync(join(directory, 'state-workspace-b-agent-test.json.lock'))).toBe(true)
    await runtime.update({ ambiguousApiKey: keyA })
    expect(runtime.workflow.get(run.id).status).toBe('rejected')
    expect((await runtime.update({ ambiguousApiKey: keyA })).workspaceChanged).toBe(false)
    runtime.close()
    expect(readdirSync(directory).filter(name => name.endsWith('.lock'))).toEqual([])
  })

  it('rota bearer inmediatamente, corta streams anteriores y nunca devuelve los secretos', async () => {
    const { runtime } = fixture(keyA)
    await runtime.initialize()
    const server = await serve(runtime)
    const controller = new AbortController()
    try {
      const response = await fetch(server.base + '/stream', { headers: headers(), signal: AbortSignal.any([controller.signal, AbortSignal.timeout(3000)]) })
      const reader = response.body!.getReader()
      await reader.read()
      const changed = await fetch(server.base + '/settings', { method: 'POST', headers: headers(), body: JSON.stringify({ coreToken: newToken }) })
      expect(changed.status).toBe(200)
      const body = await changed.text()
      expect(JSON.parse(body)).toMatchObject({ tokenChanged: true, workspaceChanged: false })
      expect(body).not.toContain(newToken)
      expect(body).not.toContain(keyA)
      while (!(await reader.read()).done) { /* Vacía el snapshot que pudo llegar en varios chunks. */ }
      expect((await fetch(server.base + '/settings', { headers: headers() })).status).toBe(401)
      const settings = await (await fetch(server.base + '/settings', { headers: headers(newToken) })).json() as SettingsState
      expect(settings.ambiguous.connected).toBe(true)
    } finally { controller.abort(); await server.close() }
  })

  it('rechaza valores vacíos, claves ajenas, saltos de línea y cuerpos que puedan inyectar variables', async () => {
    const { runtime, envPath, source } = fixture()
    const server = await serve(runtime)
    try {
      for (const body of [{}, { coreToken: '' }, { ambiguousApiKey: 'ak_xxx' }, { sponsorKey: keyA }, { coreToken: token + '\nOTHER=injected' }, { ambiguousApiKey: keyA + '\r\nOTHER=injected' }, { coreToken: token + '#comment' }]) {
        const response = await fetch(server.base + '/settings', { method: 'POST', headers: headers(), body: JSON.stringify(body) })
        expect(response.status).toBe(400)
        const message = await response.text()
        expect(JSON.parse(message).error).toMatchObject({ code: 'VALIDATION_FAILED', details: [] })
        expect(message).not.toContain(token)
        expect(message).not.toContain(keyA)
      }
      expect(readFileSync(envPath, 'utf8')).toBe(source)
    } finally { await server.close() }
  })
})
