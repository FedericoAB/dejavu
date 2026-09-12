import { closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync, fsyncSync } from 'node:fs'
import { dirname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { parseEnv } from 'node:util'
import { DomainError } from '../errors/index.js'

type SecretName = 'AMBIGUOUS_API_KEY' | 'CORE_INGEST_TOKEN'
export interface SettingsRepository { save(changes: Partial<Record<SecretName, string>>): void }

// Conserva comentarios, variables ajenas y valores multilínea. Solo reemplaza las credenciales indicadas.
export class FileSettingsRepository implements SettingsRepository {
  constructor(readonly path: string) {}
  save(changes: Partial<Record<SecretName, string>>) {
    const temporary = `${this.path}.${randomUUID()}.tmp`
    let descriptor: number | undefined
    try {
      const source = existsSync(this.path) ? readFileSync(this.path, 'utf8') : ''
      const original = parseEnv(source)
      const lines = source.split('\n'), output: string[] = [], replaced = new Set<string>()
      for (let index = 0; index < lines.length; index++) {
        const block = [lines[index]]
        const assignment = lines[index].match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z_0-9]*)\s*=\s*(.*)$/)
        if (assignment) {
          const value = assignment[2], quote = value[0]
          if (['"', "'", '`'].includes(quote) && value.indexOf(quote, 1) < 0) {
            while (++index < lines.length) {
              block.push(lines[index])
              if (lines[index].includes(quote)) break
            }
          }
          const name = assignment[1] as SecretName
          if (Object.hasOwn(changes, name)) {
            if (!replaced.has(name)) output.push(`${name}=${changes[name]}`)
            replaced.add(name)
            continue
          }
        }
        output.push(...block)
      }
      for (const [name, value] of Object.entries(changes)) {
        if (!replaced.has(name)) output.push(`${name}=${value}`)
      }
      const updated = output.join('\n').replace(/\n*$/, '\n')
      const parsed = parseEnv(updated)
      if (Object.entries(original).some(([name, value]) => !Object.hasOwn(changes, name) && parsed[name] !== value)
        || Object.entries(changes).some(([name, value]) => parsed[name] !== value)) {
        throw new Error('No se puede preservar la configuración existente.')
      }
      mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 })
      descriptor = openSync(temporary, 'wx', 0o600)
      writeFileSync(descriptor, updated)
      fsyncSync(descriptor)
      closeSync(descriptor); descriptor = undefined
      renameSync(temporary, this.path)
    } catch {
      throw new DomainError('CONFIGURATION_ERROR', 'No se pudo guardar la configuración privada. Revisá los permisos y el formato de .env; la configuración activa se conserva.')
    } finally {
      if (descriptor !== undefined) closeSync(descriptor)
      try { unlinkSync(temporary) } catch { /* El rename ya retiró el temporal o no llegó a crearse. */ }
    }
  }
}
