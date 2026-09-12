import { DETECTOR_CONFIG, detectRaw } from '@dejavu/detector'
import { DomainError } from '../errors/index.js'
import type { ObservedEvent, Run, Task, Workspace } from '../models/index.js'
import { StateRepository } from '../repositories/state.js'

// Perfil explicito de la unica receta del MVP; no modifica el detector general.
export const HANDOFF_CONFIG = { ...DETECTOR_CONFIG, minManualDurationMs: 5_000, scoreThreshold: 0.35, minLen: 3, maxLen: 3 }
const KINDS = ['navigate', 'copy', 'doc.create'] as const
const plain = (text: string) => text.replace(/[<>[\]_*`#\\]/g, '').slice(0, 12_000)
export function compileHandoff(task: Task) {
  return {
    title: `Traspaso — ${task.title}`.slice(0, 160),
    content: `# Traspaso de tarea\n\n${plain(task.title)}\n\nEstado: ${plain(task.status)}\nPrioridad: ${plain(task.priority)}\nVencimiento: ${plain(task.due_date ?? 'Sin fecha')}\n\n## Contexto registrado\n\n${plain(task.description || 'Sin descripción registrada.')}\n\n## Antes de continuar\n\n- Revisar el contexto y acordar el próximo paso.\n- Confirmar responsable y fecha.\n\nOrigen: tarea ${task.id}\n\nPreparado por Déjà Vu a partir de los datos registrados; no infiere avances ni compromisos.`,
  }
}

export class Workflow {
  private locks = new Set<string>()
  constructor(readonly repository: StateRepository, readonly workspace: Workspace, private now = () => Date.now()) {}
  get state() { return this.repository.state }
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
        ? detectRaw(this.state.events, { config: HANDOFF_CONFIG, now: this.now() })
          .find(c => c.kinds.join(',') === KINDS.join(','))
        : undefined
      const run: Run = {
        id, task, mode: 'manual', status: 'opened', openedAt: new Date(this.now()).toISOString(),
        ...(candidate ? { offer: { support: candidate.support, medianDurationMs: candidate.medianDurationMs } } : {}),
      }
      this.state.runs.push(run)
      this.event('navigate', run)
      this.repository.save()
      return run
    } finally { this.locks.delete('open') }
  }
  prepare(id: string, assisted: boolean, copied?: { title: string; description: string }) {
    const run = this.get(id)
    if (run.status === 'waiting_approval') return run
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
    this.event('copy', run)
    this.repository.save()
    return run
  }
  dismiss(id: string) {
    const run = this.get(id)
    if (run.status !== 'opened') throw new DomainError('CONFLICT', 'La oferta ya no está disponible.')
    delete run.offer
    this.state.dismissedUntil = this.now() + 86_400_000
    this.repository.save()
    return run
  }
  reject(id: string) {
    const run = this.get(id)
    if (run.status === 'rejected') return run
    if (!['opened', 'waiting_approval'].includes(run.status)) throw new DomainError('CONFLICT', 'La escritura ya comenzó o terminó.')
    run.status = 'rejected'
    // Cortar la secuencia impide combinar mitades de vueltas canceladas.
    this.state.events = this.state.events.filter(e => e.runId !== run.id)
    this.repository.save()
    return run
  }
  async approve(id: string) {
    const run = this.get(id)
    if (run.status === 'succeeded' || run.status === 'created') return run
    if (run.status !== 'waiting_approval' || !run.draft) throw new DomainError('CONFLICT', 'Esta corrida no espera aprobación. No se repetirá la escritura.')
    run.status = 'writing'
    this.repository.save() // Antes de llamar al proveedor; nunca reenvia un POST incierto.
    try {
      const document = await this.workspace.createDocument(run.draft)
      run.documentId = document.id
      run.status = 'created'
      this.repository.save()
    } catch (error) {
      run.status = 'uncertain'
      const reason = error instanceof DomainError ? `${error.message} ` : ''
      run.error = `${reason}No se pudo confirmar la escritura. Revisá Docs en Ambiguous antes de hacer otra; esta corrida no reintentará el POST.`
      this.repository.save()
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
      run.verifiedAt = new Date(this.now()).toISOString()
      delete run.error
    } catch {
      run.error = 'El documento fue creado, pero no se pudo verificar su contenido. Reintentá solo la lectura.'
    } finally { this.locks.delete(id); this.repository.save() }
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
