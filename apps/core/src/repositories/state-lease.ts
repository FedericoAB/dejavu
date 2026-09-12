import { closeSync, mkdirSync, openSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { DomainError } from '../errors/index.js'

// Un único escritor por archivo. Un bloqueo huérfano se recupera con el runbook.
export class StateLease {
  private owned = false
  readonly path: string
  constructor(statePath: string) {
    this.path = `${statePath}.lock`
    let descriptor: number | undefined
    try {
      mkdirSync(dirname(statePath), { recursive: true, mode: 0o700 })
      descriptor = openSync(this.path, 'wx', 0o600)
      this.owned = true
      writeFileSync(descriptor, JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }))
    } catch (error) {
      this.release()
      if ((error as NodeJS.ErrnoException).code === 'EEXIST') {
        throw new DomainError('CONFLICT', 'El estado ya tiene un escritor o un bloqueo pendiente. Seguí docs/runbook.md; no borres el historial.')
      }
      throw new DomainError('CONFIGURATION_ERROR', 'No se pudo bloquear el estado privado. Revisá el directorio de datos y sus permisos.')
    } finally { if (descriptor !== undefined) closeSync(descriptor) }
  }
  release() {
    if (!this.owned) return
    try { unlinkSync(this.path) } catch { /* Conserva el error original del cierre. */ }
    this.owned = false
  }
}
