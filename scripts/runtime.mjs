import { existsSync } from 'node:fs'
import { createServer } from 'node:net'
import { delimiter, isAbsolute, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

export const root = fileURLToPath(new URL('../', import.meta.url))

export function configuration() {
  if (Number(process.versions.node.split('.')[0]) < 22) {
    throw new Error('Se requiere Node.js 22 o superior.')
  }
  const injectedSecrets = new Set(['AMBIGUOUS_API_KEY', 'CORE_INGEST_TOKEN'].filter(key => Object.hasOwn(process.env, key)))
  try { process.loadEnvFile(join(root, '.env')) } catch (error) {
    if (error.code !== 'ENOENT') throw new Error('No se pudo leer .env. Revisá el formato y los permisos.')
  }
  const port = (key, fallback) => {
    const value = process.env[key] ?? String(fallback)
    if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 65535) {
      throw new Error(`${key} debe ser un puerto entre 1 y 65535.`)
    }
    return Number(value)
  }
  const corePort = port('CORE_PORT', 8080)
  const webPort = port('WEB_PORT', 3000)
  if (corePort === webPort) throw new Error('CORE_PORT y WEB_PORT deben ser distintos.')
  const coreHost = process.env.CORE_HOST || '127.0.0.1'
  const webHost = process.env.WEB_HOST || '127.0.0.1'
  const urlHost = host => host.includes(':') ? `[${host}]` : host
  const coreUrl = `http://${urlHost(coreHost === '0.0.0.0' || coreHost === '::' ? '127.0.0.1' : coreHost)}:${corePort}`
  const webUrl = `http://${urlHost(webHost === '0.0.0.0' || webHost === '::' ? '127.0.0.1' : webHost)}:${webPort}`
  process.env.CORE_HOST = coreHost
  process.env.CORE_PORT = String(corePort)
  process.env.WEB_HOST = webHost
  process.env.WEB_PORT = String(webPort)
  process.env.CORE_API_URL ||= coreUrl
  process.env.ALLOWED_ORIGINS ||= [...new Set([webUrl, `http://127.0.0.1:${webPort}`, `http://localhost:${webPort}`])].join(',')
  const childEnv = { ...process.env }
  // El core relee .env al reiniciar. No fijar en tsx watch los secretos antiguos
  // que luego pueden cambiarse desde Configuración. Se respetan los del entorno externo.
  for (const key of ['AMBIGUOUS_API_KEY', 'CORE_INGEST_TOKEN']) {
    if (!injectedSecrets.has(key)) delete childEnv[key]
  }
  return { coreHost, corePort, webHost, webPort, coreUrl, webUrl, childEnv }
}

export function packageManager() {
  const explicit = process.env.PNPM_EXEC_PATH
  const inherited = process.env.npm_execpath
  for (const candidate of [explicit, inherited?.match(/(?:^|[/\\])pnpm[^/\\]*\.(?:c?js|mjs)$/) ? inherited : undefined]) {
    if (!candidate) continue
    const path = isAbsolute(candidate) ? candidate : resolve(root, candidate)
    if (!existsSync(path)) throw new Error('La ruta configurada para pnpm no existe.')
    return /\.(?:c?js|mjs)$/.test(path)
      ? { command: process.execPath, prefix: [path] }
      : { command: path, prefix: [] }
  }
  const executable = name => {
    const suffixes = process.platform === 'win32' ? ['.cmd', '.exe', ''] : ['']
    for (const folder of (process.env.PATH ?? '').split(delimiter)) {
      for (const suffix of suffixes) {
        const path = join(folder, name + suffix)
        if (existsSync(path)) return path
      }
    }
  }
  const pnpm = executable('pnpm')
  if (pnpm) return { command: pnpm, prefix: [] }
  const corepack = executable('corepack')
  if (corepack) return { command: corepack, prefix: ['pnpm@9.15.0'] }
  throw new Error('No se encontró pnpm. Instalá pnpm 9.15.0 o usá corepack pnpm@9.15.0.')
}

async function availablePort(name, host, port) {
  await new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', error => reject(new Error(error.code === 'EADDRINUSE'
      ? `${name}: el puerto ${port} está ocupado. Detené el proceso existente antes de iniciar otro.`
      : `${name}: no se puede escuchar en el host/puerto configurado (${error.code ?? 'error de red'}).`)))
    server.listen({ host, port, exclusive: true }, () => server.close(resolve))
  })
}

export async function preflight({ production = false, checkPorts = true } = {}) {
  const config = configuration()
  // La pantalla de configuración debe poder abrirse antes de conectar el proveedor.
  const providerKeyPresent = Boolean(process.env.AMBIGUOUS_API_KEY?.startsWith('ak_') && process.env.AMBIGUOUS_API_KEY !== 'ak_xxx')
  if ((process.env.CORE_INGEST_TOKEN?.length ?? 0) < 24) {
    throw new Error('CORE_INGEST_TOKEN debe tener al menos 24 caracteres. Ejecutá pnpm run setup o configurá el entorno.')
  }
  for (const path of ['apps/core/src/index.ts', 'apps/web/package.json', 'apps/core/node_modules/.bin/tsx', 'apps/web/node_modules/.bin/next']) {
    if (!existsSync(join(root, path))) throw new Error(`Falta ${path}. Ejecutá pnpm install --frozen-lockfile desde la raíz.`)
  }
  if (production && !existsSync(join(root, 'apps/web/.next/BUILD_ID'))) {
    throw new Error('Falta la compilación del frontend. Ejecutá pnpm build antes de pnpm start.')
  }
  const manager = packageManager()
  if (checkPorts) await Promise.all([
    availablePort('Core', config.coreHost, config.corePort),
    availablePort('Web', config.webHost, config.webPort),
  ])
  return { ...config, manager, providerKeyPresent }
}
