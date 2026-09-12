import { DETECTOR_CONFIG, detectRaw, median } from '@dejavu/detector'
import { DomainError } from '../errors/index.js'
import type { Metrics, ObservedEvent, Pattern, Routine, Run, Task, Workspace } from '../models/index.js'
import { StateRepository } from '../repositories/state.js'

// Perfil explicito de la unica receta del MVP; no modifica el detector general.
export const HANDOFF_CONFIG = { ...DETECTOR_CONFIG, minManualDurationMs: 5_000, scoreThreshold: 0.35, minLen: 3, maxLen: 3 }
const KINDS = ['navigate', 'copy', 'doc.create'] as const
const STEPS = [
  { id: 'open', kind: 'navigate', title: 'Abrir la tarea de origen' },
  { id: 'prepare', kind: 'copy', title: 'Copiar el contexto y revisar la vista previa' },
  { id: 'create', kind: 'doc.create', title: 'Aprobar, crear y verificar el documento' },
]
export const HANDOFF_ID = 'task-handoff'
const plain = (text: string) => text.replace(/[<>[\]_*`#\\]/g, '').slice(0, 12_000)
export function compileHandoff(task: Task) {
  return {
    title: `Traspaso — ${task.title}`.slice(0, 160),
    content: `# Traspaso de tarea\n\n${plain(task.title)}\n\nEstado: ${plain(task.status)}\nPrioridad: ${plain(task.priority)}\nVencimiento: ${plain(task.due_date ?? 'Sin fecha')}\n\n## Contexto registrado\n\n${plain(task.description || 'Sin descripción registrada.')}\n\n## Antes de continuar\n\n- Revisar el contexto y acordar el próximo paso.\n- Confirmar responsable y fecha.\n\nOrigen: tarea ${task.id}\n\nPreparado por Déjà Vu a partir de los datos registrados; no infiere avances ni compromisos.`,
  }
}

export class Workflow {
  private locks = new Set<string>()
  private listeners = new Map<string, Set<(run: Run) => void>>()
  constructor(readonly repository: StateRepository, readonly workspace: Workspace, private now = () => Date.now()) {}
  get state() { return this.repository.state }
  get hasActiveWork() {
    return this.locks.size > 0 || this.state.runs.some(run => ['opened', 'waiting_approval', 'writing'].includes(run.status))
  }
  // Solo las vueltas manuales completas y verificadas son evidencia del detector.
  private evidence() {
    const verified = new Set(this.state.runs.filter(run => run.mode === 'manual' && run.status === 'succeeded').map(run => run.id))
    return this.state.events.filter(event => verified.has(event.runId))
  }
  patterns(): Pattern[] {
    const evidence = this.evidence()
    return detectRaw(evidence, { config: HANDOFF_CONFIG, now: this.now() })
      .filter(candidate => candidate.kinds.join(',') === KINDS.join(','))
      .map(candidate => ({
        id: HANDOFF_ID, name: 'Traspaso de tarea',
        description: 'Abrir una tarea, copiar su contexto y crear un documento de traspaso.',
        support: candidate.support, score: candidate.score, medianDurationMs: candidate.medianDurationMs,
        detectedAt: candidate.occurrences[candidate.occurrences.length - 1].endedAt,
        steps: STEPS.map(({ kind, title }) => ({ kind, title })),
        occurrences: candidate.occurrences.map(occurrence => ({
          runId: evidence[occurrence.start].runId, startedAt: occurrence.startedAt,
          endedAt: occurrence.endedAt, durationMs: occurrence.durationMs,
        })),
      }))
  }
  routines(): Routine[] {
    return [{
      id: HANDOFF_ID, name: 'Traspaso de tarea',
      description: 'Plantilla fija: conserva el contexto registrado de una tarea en un documento de Ambiguous, previa aprobación.',
      source: 'fixed-template', requiresApproval: true, enabled: true,
      estimatedManualMs: this.patterns()[0]?.medianDurationMs ?? null,
      steps: STEPS.map(step => ({ ...step })),
    }]
  }
  routine(id: string): Routine {
    const routine = this.routines().find(item => item.id === id)
    if (!routine) throw new DomainError('NOT_FOUND', 'No se encontró la rutina.')
    return routine
  }
  metrics(): Metrics {
    const runs = this.state.runs
    const evidence = this.evidence()
    const durations = runs.filter(run => run.mode === 'manual' && run.status === 'succeeded').flatMap(run => {
      const events = evidence.filter(event => event.runId === run.id)
      if (events.map(event => event.kind).join(',') !== KINDS.join(',')) return []
      return [Date.parse(events[2].occurredAt) - Date.parse(events[0].occurredAt)]
    })
    // Estimación conservadora: mediana ofrecida menos tiempo total de la vuelta asistida.
    // No inventa una base cuando falta evidencia, ni presenta la estimación como ahorro medido.
    const savings = runs.filter(run => run.mode === 'assisted' && run.status === 'succeeded' && run.offer && run.verifiedAt)
      .map(run => Math.max(0, run.offer!.medianDurationMs - (Date.parse(run.verifiedAt!) - Date.parse(run.openedAt))))
    return {
      observedEvents: this.state.events.length,
      manualCompleted: runs.filter(run => run.mode === 'manual' && run.status === 'succeeded').length,
      assistedCompleted: runs.filter(run => run.mode === 'assisted' && run.status === 'succeeded').length,
      offered: runs.filter(run => run.offeredAt || run.offer).length,
      approved: runs.filter(run => run.approvedAt || ['writing', 'created', 'succeeded', 'uncertain'].includes(run.status)).length,
      rejected: runs.filter(run => run.status === 'rejected').length,
      dismissed: runs.filter(run => run.dismissedAt).length,
      activeRuns: runs.filter(run => ['opened', 'waiting_approval', 'writing', 'created', 'uncertain'].includes(run.status)).length,
      medianManualDurationMs: durations.length ? median(durations) : null,
      estimatedSavedMs: savings.length ? savings.reduce((total, value) => total + value, 0) : null,
      paused: this.state.paused,
    }
  }
  subscribe(id: string, listener: (run: Run) => void) {
    this.get(id)
    const listeners = this.listeners.get(id) ?? new Set<(run: Run) => void>()
    listeners.add(listener)
    this.listeners.set(id, listeners)
    return () => {
      listeners.delete(listener)
      if (!listeners.size) this.listeners.delete(id)
    }
  }
  private save(run: Run) {
    run.revision = (run.revision ?? 0) + 1
    this.repository.save()
    for (const listener of this.listeners.get(run.id) ?? []) {
      // Un cliente desconectado no puede interrumpir una escritura ya persistida.
      try { listener(run) } catch { /* El controlador limpia la suscripción al cerrar. */ }
    }
  }
  get(id: string) {
    const run = this.state.runs.find(r => r.id === id)
    if (!run) throw new DomainError('NOT_FOUND', 'No se encontró la corrida.')
    return run
  }
  private event(kind: typeof KINDS[number], run: Run) {
    if (this.state.paused || run.mode !== 'manual') return
    const event: ObservedEvent = {
      runId: run.id,
      source: 'browser', kind, occurredAt: new Date(this.now()).toISOString(), app: 'ambiguous-handoff',
      locator: { urlPattern: '/tasks/:id/handoff', role: 'button', label: kind },
      // El detector recibe forma, no títulos ni descripciones.
    }
    this.state.events.push(event)
    this.state.events = this.state.events.slice(-120)
  }
  async open(taskId: string, id: string) {
    const existing = this.state.runs.find(r => r.id === id)
    if (existing) {
      if (existing.task.id !== taskId) throw new DomainError('CONFLICT', 'La clave ya pertenece a otra tarea.')
      return existing
    }
    if (this.locks.has('open')) throw new DomainError('CONFLICT', 'Ya se está abriendo una tarea.')
    this.locks.add('open')
    try {
      if (this.state.runs.some(r => ['opened', 'waiting_approval', 'writing'].includes(r.status))) {
        throw new DomainError('CONFLICT', 'Terminá o cancelá la corrida actual primero.')
      }
      const task = await this.workspace.task(taskId)
      const candidate = !this.state.paused && this.state.dismissedUntil <= this.now()
        ? this.patterns()[0]
        : undefined
      const run: Run = {
        id, task, mode: 'manual', status: 'opened', openedAt: new Date(this.now()).toISOString(),
        ...(candidate ? { offeredAt: new Date(this.now()).toISOString(), offer: { support: candidate.support, medianDurationMs: candidate.medianDurationMs } } : {}),
      }
      this.state.runs.push(run)
      this.event('navigate', run)
      this.save(run)
      return run
    } finally { this.locks.delete('open') }
  }
  prepare(id: string, assisted: boolean, copied?: { title: string; description: string }) {
    const run = this.get(id)
    if (run.status === 'waiting_approval') {
      if (assisted !== (run.mode === 'assisted')) throw new DomainError('CONFLICT', 'La vista previa ya se preparó con otro modo.')
      return run
    }
    if (run.status !== 'opened') throw new DomainError('CONFLICT', 'La corrida ya no está abierta.')
    if (assisted && !run.offer) throw new DomainError('CONFLICT', 'No hay un patrón ofrecido para esta corrida.')
    if (!assisted && (copied?.title !== run.task.title || copied.description !== (run.task.description ?? ''))) {
      throw new DomainError('VALIDATION_FAILED', 'Esta receta copia título y descripción de la tarea. Revisá que coincidan con el origen.')
    }
    if (assisted) {
      run.mode = 'assisted'
      // La vuelta asistida nunca se cuenta como evidencia manual.
      this.state.events = this.state.events.filter(e => e.runId !== run.id)
    }
    run.draft = compileHandoff(run.task)
    run.status = 'waiting_approval'
    run.preparedAt = new Date(this.now()).toISOString()
    this.event('copy', run)
    this.save(run)
    return run
  }
  dismiss(id: string) {
    const run = this.get(id)
    if (run.status !== 'opened') throw new DomainError('CONFLICT', 'La oferta ya no está disponible.')
    if (run.dismissedAt) return run
    if (!run.offer) throw new DomainError('CONFLICT', 'No hay una oferta para silenciar.')
    delete run.offer
    run.dismissedAt = new Date(this.now()).toISOString()
    this.state.dismissedUntil = this.now() + 86_400_000
    this.save(run)
    return run
  }
  reject(id: string) {
    const run = this.get(id)
    if (run.status === 'rejected') return run
    if (!['opened', 'waiting_approval'].includes(run.status)) throw new DomainError('CONFLICT', 'La escritura ya comenzó o terminó.')
    run.status = 'rejected'
    run.rejectedAt = new Date(this.now()).toISOString()
    // Cortar la secuencia impide combinar mitades de vueltas canceladas.
    this.state.events = this.state.events.filter(e => e.runId !== run.id)
    this.save(run)
    return run
  }
  async approve(id: string) {
    const run = this.get(id)
    if (run.status === 'succeeded' || run.status === 'created') return run
    if (run.status !== 'waiting_approval' || !run.draft) throw new DomainError('CONFLICT', 'Esta corrida no espera aprobación. No se repetirá la escritura.')
    run.status = 'writing'
    run.approvedAt = new Date(this.now()).toISOString()
    this.save(run) // Antes de llamar al proveedor; nunca reenvia un POST incierto.
    try {
      const document = await this.workspace.createDocument(run.draft)
      run.documentId = document.id
      run.status = 'created'
      this.save(run)
    } catch (error) {
      run.status = 'uncertain'
      const reason = error instanceof DomainError ? `${error.message} ` : ''
      run.error = `${reason}No se pudo confirmar la escritura. Revisá Docs en Ambiguous antes de hacer otra; esta corrida no reintentará el POST.`
      this.save(run)
      return run
    }
    return this.verify(id)
  }
  async verify(id: string) {
    const run = this.get(id)
    if (!run.documentId) throw new DomainError('CONFLICT', 'Todavía no hay un documento para verificar.')
    if (this.locks.has(id)) throw new DomainError('CONFLICT', 'La verificación está en curso.')
    this.locks.add(id)
    try {
      const doc = await this.workspace.document(run.documentId)
      if (doc.id !== run.documentId || doc.title !== run.draft?.title || !doc.content?.includes(run.task.id)) {
        throw new DomainError('VERIFY_FAILED', 'El documento no coincide con la tarea y el título aprobados.')
      }
      if (run.status !== 'succeeded') this.event('doc.create', run)
      run.status = 'succeeded'
      run.verifiedAt ??= new Date(this.now()).toISOString()
      delete run.error
    } catch {
      run.error = 'El documento fue creado, pero no se pudo verificar su contenido. Reintentá solo la lectura.'
    } finally { this.locks.delete(id); this.save(run) }
    return run
  }
  pause(paused: boolean) {
    if (this.state.runs.some(r => ['opened', 'waiting_approval', 'writing'].includes(r.status))) {
      throw new DomainError('CONFLICT', 'Terminá o cancelá la corrida antes de cambiar la observación.')
    }
    this.state.paused = paused
    this.state.events = [] // No unir secuencias a ambos lados de una pausa.
    this.repository.save()
  }
}
