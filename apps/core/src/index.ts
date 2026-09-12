import process from 'node:process'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { Server } from 'node:http'
import { createApp } from './controllers/api.js'
import { AmbiguousWorkspace } from './connectors/ambiguous.js'
import { FileSettingsRepository } from './repositories/settings.js'
import { LocalRuntime } from './services/settings.js'
import { DomainError } from './errors/index.js'

const root = fileURLToPath(new URL('../../../', import.meta.url))
let server: Server | undefined
let runtime: LocalRuntime | undefined
let closeStreams = () => {}
let closing = false

function shutdown() {
  if (closing) return
  closing = true
  console.log('Cerrando el core; esperando solicitudes pendientes…')
  closeStreams()
  if (!server) { runtime?.close(); process.exit(0) }
  const timeout = setTimeout(() => {
    server?.closeAllConnections()
    runtime?.close()
    process.exit(1)
  }, 12_000)
  timeout.unref()
  server.close(() => {
    clearTimeout(timeout)
    runtime?.close()
    process.exit(0)
  })
  server.closeIdleConnections()
}

// También cubre señales mientras se valida la identidad o se abre el puerto.
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
process.on('exit', () => runtime?.close())

async function start() {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Se requiere Node.js 22 o superior.')
  try { process.loadEnvFile(resolve(root, '.env')) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('No se pudo leer .env. Revisá el formato y los permisos.')
  }
  const token = process.env.CORE_INGEST_TOKEN ?? ''
  if (token.length < 24) throw new Error('CORE_INGEST_TOKEN debe tener al menos 24 caracteres. Ejecutá pnpm run setup.')
  const portValue = process.env.CORE_PORT ?? '8080'
  if (!/^\d+$/.test(portValue) || Number(portValue) < 1 || Number(portValue) > 65535) {
    throw new Error('CORE_PORT debe ser un puerto entre 1 y 65535.')
  }
  const port = Number(portValue)
  const host = process.env.CORE_HOST || '127.0.0.1'
  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',').map(origin => origin.trim()).filter(Boolean)
  runtime = new LocalRuntime({
    token, ambiguousApiKey: process.env.AMBIGUOUS_API_KEY,
    dataDirectory: resolve(root, process.env.DEJAVU_DATA_DIR || '.local'),
    settingsRepository: new FileSettingsRepository(resolve(root, '.env')),
    workspace: key => new AmbiguousWorkspace(key),
    onSecretsChanged: changes => {
      if (changes.ambiguousApiKey !== undefined) process.env.AMBIGUOUS_API_KEY = changes.ambiguousApiKey
      if (changes.coreToken !== undefined) process.env.CORE_INGEST_TOKEN = changes.coreToken
    },
  })
  await runtime.initialize()
  const current = runtime
  const app = createApp(() => current.workflow, () => current.token, { settings: current, ...(allowedOrigins ? { allowedOrigins } : {}) })
  closeStreams = () => app.locals.closeStreams()
  await new Promise<void>((ready, fail) => {
    server = app.listen(port, host, ready)
    server.once('error', fail)
  })
  console.log(`Core listo en ${host}:${port}. Abrí el frontend para conectar o configurar Ambiguous.`)
}

start().catch((error: unknown) => {
  runtime?.close()
  const code = (error as NodeJS.ErrnoException)?.code
  const message = code === 'EADDRINUSE'
    ? 'El puerto del core está ocupado. Detené el proceso existente o configurá CORE_PORT.'
    : error instanceof DomainError || (error instanceof Error && !code)
      ? error.message
      : 'No se pudo iniciar el core. Revisá la configuración y los permisos del directorio de datos.'
  console.error(`Déjà Vu: ${message}`)
  process.exitCode = 1
})
