import { mkdirSync, openSync, closeSync, writeFileSync, unlinkSync } from 'node:fs'
import process from 'node:process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Server } from 'node:http'
import { createApp } from './controllers/api.js'
import { AmbiguousWorkspace } from './connectors/ambiguous.js'
import { StateRepository } from './repositories/state.js'
import { Workflow } from './services/workflow.js'
import { DomainError } from './errors/index.js'

const root = fileURLToPath(new URL('../../../', import.meta.url))
let server: Server | undefined
let lockPath: string | undefined
let lockOwned = false

function releaseLock() {
  if (!lockOwned || !lockPath) return
  try { unlinkSync(lockPath) } catch { /* Conservar el error original del arranque/cierre. */ }
  lockOwned = false
}

async function start() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Se requiere Node.js 22 o superior.')
  try { process.loadEnvFile(resolve(root, '.env')) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('No se pudo leer .env. Revisá el formato y los permisos.')
  }
  const token = process.env.CORE_INGEST_TOKEN ?? ''
  if (token.length < 24) throw new Error('CORE_INGEST_TOKEN debe tener al menos 24 caracteres. Ejecutá pnpm run setup.')
  const key = process.env.AMBIGUOUS_API_KEY ?? ''
  if (!key.startsWith('ak_') || key === 'ak_xxx') throw new Error('Configurá AMBIGUOUS_API_KEY en .env o en el entorno del proceso.')
  const portValue = process.env.CORE_PORT ?? '8080'
  if (!/^\d+$/.test(portValue) || Number(portValue) < 1 || Number(portValue) > 65535) {
    throw new Error('CORE_PORT debe ser un puerto entre 1 y 65535.')
  }
  const port = Number(portValue)
  const host = process.env.CORE_HOST || '127.0.0.1'
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean)
  const workspace = new AmbiguousWorkspace(key)
  const identity = await workspace.identity()
  // Las rutas relativas siempre parten de la raíz, también al iniciar desde apps/core.
  const directory = resolve(root, process.env.DEJAVU_DATA_DIR || '.local')
  const path = resolve(directory, `state-${encodeURIComponent(identity.workspace_id)}-${encodeURIComponent(identity.id)}.json`)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  lockPath = `${path}.lock`
  let descriptor: number
  try { descriptor = openSync(lockPath, 'wx', 0o600) } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
      throw new Error('El estado ya tiene un escritor o quedó un bloqueo tras un cierre abrupto. Detené el otro core y seguí docs/runbook.md; no borres el historial.')
    }
    throw new Error('No se pudo bloquear el directorio de datos. Revisá DEJAVU_DATA_DIR y sus permisos.')
  }
  lockOwned = true
  try { writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })) } finally { closeSync(descriptor) }
  const workflow = new Workflow(new StateRepository(path), workspace)
  const app = createApp(workflow, token, { ...(allowedOrigins ? { allowedOrigins } : {}) })
  await new Promise<void>((ready, fail) => {
    server = app.listen(port, host, ready)
    server.once('error', fail)
  })
  let closing = false
  const shutdown = () => {
    if (closing) return
    closing = true
    console.log('Cerrando el core; esperando solicitudes pendientes…')
    app.locals.closeStreams()
    const timeout = setTimeout(() => {
      server?.closeAllConnections()
      releaseLock()
      process.exit(1)
    }, 12_000)
    timeout.unref()
    server?.close(() => {
      clearTimeout(timeout)
      releaseLock()
      process.exit(0)
    })
    server?.closeIdleConnections()
  }
  process.on('SIGINT', shutdown)
  process.on('SIGTERM', shutdown)
  console.log(`Core listo en ${host}:${port}. Abrí el frontend o Ambiguous con la extensión instalada.`)
}

process.on('exit', releaseLock)
start().catch((error: unknown) => {
  releaseLock()
  const code = (error as NodeJS.ErrnoException)?.code
  const message = code === 'EADDRINUSE'
    ? 'El puerto del core está ocupado. Detené el proceso existente o configurá CORE_PORT.'
    : error instanceof DomainError || (error instanceof Error && !code)
      ? error.message
      : 'No se pudo iniciar el core. Revisá la configuración y los permisos del directorio de datos.'
  console.error(`Déjà Vu: ${message}`)
  process.exitCode = 1
})
