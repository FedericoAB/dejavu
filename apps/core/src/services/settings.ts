import { resolve } from 'node:path'
import { z } from 'zod'
import { DomainError } from '../errors/index.js'
import type { SettingsManager, SettingsState, SettingsUpdate, SettingsUpdateResult, Workspace, WorkspaceIdentity } from '../models/index.js'
import type { SettingsRepository } from '../repositories/settings.js'
import { StateLease } from '../repositories/state-lease.js'
import { StateRepository } from '../repositories/state.js'
import { Workflow } from './workflow.js'

export const settingsUpdateSchema = z.object({
  ambiguousApiKey: z.string().min(11).max(512).regex(/^ak_[A-Za-z0-9._~+/=-]+$/).refine(value => value !== 'ak_xxx').optional(),
  coreToken: z.string().min(24).max(256).regex(/^[A-Za-z0-9._~+/=-]+$/).optional(),
}).strict().refine(value => value.ambiguousApiKey !== undefined || value.coreToken !== undefined)

function unavailableWorkspace(): Workspace {
  const unavailable = async (): Promise<never> => { throw new DomainError('NOT_CONFIGURED', 'Configurá y validá la API key de Ambiguous en Configuración.') }
  return { identity: unavailable, tasks: unavailable, task: unavailable, createDocument: unavailable, document: unavailable }
}

type Context = { workflow: Workflow; identity: WorkspaceIdentity; statePath: string; lease: StateLease }
export type LocalRuntimeOptions = {
  token: string
  ambiguousApiKey?: string
  dataDirectory: string
  settingsRepository: SettingsRepository
  workspace: (key: string) => Workspace
  onSecretsChanged?: (changes: SettingsUpdate) => void
}

export class LocalRuntime implements SettingsManager {
  private context?: Context
  private readonly emptyWorkflow = new Workflow(new StateRepository(), unavailableWorkspace())
  private listeners = new Set<() => void>()
  private updating = false
  private closed = false
  private connectionError?: string
  private key: string
  private currentToken: string
  constructor(private options: LocalRuntimeOptions) {
    this.currentToken = options.token
    this.key = options.ambiguousApiKey && options.ambiguousApiKey !== 'ak_xxx' ? options.ambiguousApiKey : ''
    if (this.currentToken.length < 24) throw new Error('CORE_INGEST_TOKEN debe tener al menos 24 caracteres.')
  }
  get workflow() { return this.context?.workflow ?? this.emptyWorkflow }
  get token() { return this.currentToken }
  get(): SettingsState {
    return {
      ambiguous: { configured: !!this.key, connected: !!this.context && !this.connectionError, identity: this.context ? { ...this.context.identity } : null, ...(this.connectionError ? { error: this.connectionError } : {}) },
      core: { tokenConfigured: this.currentToken.length >= 24, minTokenLength: 24 },
    }
  }
  private statePath(identity: WorkspaceIdentity) {
    return resolve(this.options.dataDirectory, `state-${encodeURIComponent(identity.workspace_id)}-${encodeURIComponent(identity.id)}.json`)
  }
  private contextFor(workspace: Workspace, identity: WorkspaceIdentity): Context {
    const statePath = this.statePath(identity)
    // Cambiar la clave del mismo agente conserva el repositorio y su exclusión mutua.
    if (this.context?.statePath === statePath) {
      return { ...this.context, identity, workflow: new Workflow(this.context.workflow.repository, workspace) }
    }
    const lease = new StateLease(statePath)
    try { return { identity, statePath, lease, workflow: new Workflow(new StateRepository(statePath), workspace) } }
    catch (error) { lease.release(); throw error }
  }
  async initialize() {
    if (!this.key) return
    let workspace: Workspace, identity: WorkspaceIdentity
    try {
      workspace = this.options.workspace(this.key)
      identity = await workspace.identity()
    } catch {
      this.connectionError = 'No se pudo validar Ambiguous. Revisá la clave, los permisos y la conexión desde Configuración.'
      return
    }
    if (!this.closed) this.context = this.contextFor(workspace, identity)
  }
  async check(): Promise<SettingsState> {
    if (!this.key) throw new DomainError('NOT_CONFIGURED', 'Primero guardá una API key de Ambiguous en Configuración.')
    if (this.updating || this.closed || this.workflow.hasActiveWork) {
      throw new DomainError('CONFLICT', 'Terminá la operación actual antes de volver a validar la conexión.')
    }
    this.updating = true
    try {
      let workspace: Workspace
      let identity: WorkspaceIdentity
      try {
        workspace = this.options.workspace(this.key)
        identity = await workspace.identity()
      }
      catch {
        this.connectionError = 'No se pudo validar Ambiguous. Revisá los permisos y la conexión, o guardá una API key nueva.'
        throw new DomainError('PROVIDER_ERROR', this.connectionError)
      }
      if (this.closed || this.workflow.hasActiveWork) throw new DomainError('CONFLICT', 'Hay una operación en curso. Terminála antes de cambiar la conexión.')
      const previous = this.context
      const replacement = this.contextFor(workspace, identity)
      this.context = replacement
      this.connectionError = undefined
      if (previous && previous.lease !== replacement.lease) previous.lease.release()
      for (const listener of this.listeners) {
        try { listener() } catch { /* La conexión recuperada permanece activa aunque un cliente se desconecte. */ }
      }
      // Revalidar no modifica .env ni vuelve a exponer la credencial guardada.
      return this.get()
    } finally { this.updating = false }
  }
  async update(input: SettingsUpdate): Promise<SettingsUpdateResult> {
    const changes = settingsUpdateSchema.parse(input)
    if (this.updating || this.closed) throw new DomainError('CONFLICT', 'La configuración está cambiando o el core se está cerrando. Reintentá la lectura.')
    this.updating = true
    let replacement: Context | undefined
    try {
      if (changes.ambiguousApiKey !== undefined) {
        if (this.workflow.hasActiveWork) throw new DomainError('CONFLICT', 'Terminá o cancelá la corrida actual antes de cambiar la conexión de Ambiguous.')
        const workspace = this.options.workspace(changes.ambiguousApiKey)
        let identity: WorkspaceIdentity
        try { identity = await workspace.identity() }
        catch { throw new DomainError('PROVIDER_ERROR', 'No se pudo validar la nueva API key de Ambiguous. Revisá la clave, los permisos y la conexión; no se guardó ningún cambio.') }
        // Una tarea pudo abrirse durante la validación remota; no cambiarle el workspace debajo.
        if (this.closed || this.workflow.hasActiveWork) throw new DomainError('CONFLICT', 'Hay una operación en curso. Terminála antes de cambiar la conexión.')
        replacement = this.contextFor(workspace, identity)
      }
      const tokenChanged = changes.coreToken !== undefined && changes.coreToken !== this.currentToken
      const workspaceChanged = !!replacement && replacement.statePath !== this.context?.statePath
      this.options.settingsRepository.save({
        ...(changes.ambiguousApiKey !== undefined ? { AMBIGUOUS_API_KEY: changes.ambiguousApiKey } : {}),
        ...(changes.coreToken !== undefined ? { CORE_INGEST_TOKEN: changes.coreToken } : {}),
      })
      const previous = this.context
      if (replacement) { this.context = replacement; this.connectionError = undefined }
      if (changes.ambiguousApiKey !== undefined) this.key = changes.ambiguousApiKey
      if (changes.coreToken !== undefined) this.currentToken = changes.coreToken
      if (previous && replacement && previous.lease !== replacement.lease) previous.lease.release()
      // Una notificación auxiliar no puede declarar fallido un cambio ya confirmado en disco.
      try { this.options.onSecretsChanged?.(changes) } catch { /* El runtime conserva los valores persistidos como fuente activa. */ }
      for (const listener of this.listeners) {
        try { listener() } catch { /* Un cliente desconectado no revierte la configuración persistida. */ }
      }
      return { settings: this.get(), tokenChanged, workspaceChanged }
    } catch (error) {
      if (replacement && replacement.lease !== this.context?.lease) replacement.lease.release()
      throw error
    } finally { this.updating = false }
  }
  subscribe(listener: () => void) {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }
  close() {
    this.closed = true
    this.context?.lease.release()
    this.listeners.clear()
  }
}
