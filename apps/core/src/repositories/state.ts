import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs'
import { dirname } from 'node:path'
import type { State } from '../models/index.js'

// Excepcion del MVP: archivo privado y un solo proceso. Ver ADR-0007.
export class StateRepository {
  readonly state: State
  private listeners = new Set<() => void>()
  constructor(private path?: string) {
    this.state = path && existsSync(path)
      ? JSON.parse(readFileSync(path, 'utf8')) as State
      : { version: 1, runs: [], events: [], dismissedUntil: 0, paused: false }
    if (this.state.version !== 1 || !Array.isArray(this.state.runs) || !Array.isArray(this.state.events)) {
      throw new Error('Estado local inválido; conservá el archivo para recuperarlo.')
    }
    for (const run of this.state.runs) {
      if (run.status === 'writing') {
        run.status = 'uncertain'
        run.error = 'El proceso se interrumpió al guardar. Revisá Docs; no se reintentará la escritura.'
      }
    }
    this.save()
  }
  save() {
    this.state.revision = (this.state.revision ?? 0) + 1
    if (this.path) {
      mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
      writeFileSync(`${this.path}.tmp`, JSON.stringify(this.state), { mode: 0o600 })
      renameSync(`${this.path}.tmp`, this.path)
    }
    for (const listener of this.listeners) {
      try { listener() } catch { /* Una vista desconectada no invalida la persistencia. */ }
    }
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
}
