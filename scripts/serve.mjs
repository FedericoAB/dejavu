import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { preflight, root } from './runtime.mjs'

export async function serve(production) {
  const config = await preflight({ production })
  const children = new Set()
  let stopping = false
  let exitCode = 0
  let forceTimer

  const signalChild = (child, signal) => {
    if (!child.pid) return
    try {
      if (process.platform !== 'win32') process.kill(-child.pid, signal)
      else child.kill(signal)
    } catch (error) {
      if (error.code !== 'ESRCH') console.error('No se pudo cerrar un proceso hijo; revisá los puertos antes de reiniciar.')
    }
  }
  const finish = () => {
    if (children.size) return
    clearTimeout(forceTimer)
    process.exitCode = exitCode
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', interrupt)
  }
  const stop = code => {
    if (stopping) return
    stopping = true
    exitCode = code
    for (const child of children) signalChild(child, 'SIGTERM')
    forceTimer = setTimeout(() => {
      for (const child of children) signalChild(child, 'SIGKILL')
    }, 15_000)
    forceTimer.unref()
    finish()
  }
  const interrupt = () => stop(0)
  process.on('SIGINT', interrupt)
  process.on('SIGTERM', interrupt)

  const start = (name, folder, args) => {
    const child = spawn(config.manager.command, [...config.manager.prefix, '--dir', join(root, folder), 'exec', ...args], {
      cwd: root,
      env: { ...process.env, ...(production ? { NODE_ENV: 'production' } : {}) },
      stdio: 'inherit',
      detached: process.platform !== 'win32',
    })
    children.add(child)
    child.once('error', () => {
      console.error(`${name} no pudo iniciarse. Revisá pnpm y las dependencias instaladas.`)
      children.delete(child)
      stop(1)
      finish()
    })
    child.once('exit', code => {
      children.delete(child)
      if (!stopping) {
        console.error(`${name} terminó${code === null ? '' : ` con código ${code}`}; cerrando el resto de la aplicación.`)
        stop(code || 1)
      }
      finish()
    })
  }
  console.log(`Iniciando Déjà Vu: ${config.webUrl} · API ${config.coreUrl}`)
  console.log('Un único core local. Ctrl+C cierra ambos procesos. Las tareas se leen del workspace conectado.')
  start('Core', 'apps/core', ['tsx', ...(production ? [] : ['watch']), 'src/index.ts'])
  start('Frontend', 'apps/web', ['next', production ? 'start' : 'dev', '--hostname', config.webHost, '--port', String(config.webPort)])
}
