import { button, card, element, input } from './shared/ui.js'

type Run = {
  id: string; task: { title: string; description: string | null; status: string; priority: string }
  status: string; mode: string; draft?: { title: string; content: string }; documentId?: string
  verifiedAt?: string; error?: string; offer?: { support: number; medianDurationMs: number }
}
type State = {
  paused: boolean; data: Run[]; meta: { total: number; hasMore: boolean }
  metrics: { manualCompleted: number; assistedCompleted: number; observedEvents: number }
}
const root = document.getElementById('app')!
let state: State | undefined
let identity = ''
let tasks: { id: string; title: string }[] = []
let cursor: string | null = null
let hasMoreTasks = false
let taskCursor: string | undefined
let selected: Run | undefined
let error = ''
let busy = false
let historyOffset = 0
let pendingOpen: { taskId: string; id: string } | undefined
let manualDraft = { runId: '', title: '', description: '' }

async function api<T>(path: string, body?: unknown): Promise<T> {
  const result = await chrome.runtime.sendMessage({ type: 'api', path, ...(body === undefined ? {} : { body }) })
  if (!result || result.error) throw new Error(result?.error ?? 'El core no respondió. Ejecutá pnpm dev.')
  return result.data as T
}
async function refresh() {
  const [snapshot, list, who] = await Promise.all([
    api<State>(`/v1/state?offset=${historyOffset}`),
    api<{ data: typeof tasks; meta: { nextCursor: string | null; hasMore: boolean } }>(`/v1/tasks${taskCursor ? `?cursor=${encodeURIComponent(taskCursor)}` : ''}`),
    api<{ display_name: string; type: string }>('/v1/workspace'),
  ])
  state = snapshot; tasks = list.data; cursor = list.meta.nextCursor; hasMoreTasks = list.meta.hasMore
  identity = `${who.display_name} · ${who.type}`
  if (selected) selected = await api<Run>(`/v1/runs/${selected.id}`)
  else selected = snapshot.data.find(r => ['opened', 'waiting_approval', 'writing', 'created', 'uncertain'].includes(r.status))
}
async function act(action: () => Promise<void>) {
  if (busy) return
  busy = true; error = ''; render()
  try { await action() } catch (e) { error = e instanceof Error ? e.message : 'No se pudo completar la acción.' }
  finally { busy = false; render() }
}
function runAction(action: string, body: unknown = {}) {
  void act(async () => { selected = await api<Run>(`/v1/runs/${selected!.id}/${action}`, body); await refresh() })
}
function renderRun(run: Run) {
  const box = card(element('p', run.mode === 'assisted' ? 'TRASPASO ASISTIDO' : 'TRASPASO MANUAL', 'eyebrow'), element('h2', run.task.title))
  box.append(element('p', `${run.task.status} · ${run.task.priority}`, 'muted'))
  if (run.status === 'opened') {
    box.append(element('p', run.task.description || 'Esta tarea no tiene descripción.'))
    if (run.offer) {
      const offer = card(element('h2', `Hiciste esto ${run.offer.support} veces.`), element('p', `Leer tarea → preparar traspaso → guardar documento. Mediana observada: ${Math.round(run.offer.medianDurationMs / 1000)} s. ¿Preparo el siguiente?`))
      offer.classList.add('offer')
      offer.append(button('Sí, preparalo', () => runAction('prepare', { assisted: true })), button('No, seguir manual · silenciar 24 h', () => runAction('dismiss'), true))
      box.append(offer)
    }
    if (manualDraft.runId !== run.id) manualDraft = { runId: run.id, title: '', description: '' }
    box.append(element('p', 'Traspaso manual: copiá el título y la descripción de arriba a estos campos. Déjà Vu reconoce esta secuencia; la próxima vez podrá completarlos por vos.'))
    const title = input('Título de la tarea')
    title.node.value = manualDraft.title
    title.node.oninput = () => { manualDraft.title = title.node.value }
    const description = element('textarea')
    description.rows = 4; description.value = manualDraft.description
    description.oninput = () => { manualDraft.description = description.value }
    const label = element('label', 'Descripción de la tarea (vacía si no tiene)')
    label.append(description)
    box.append(title.wrapper, label,
      button('Preparar con los datos copiados', () => runAction('prepare', { assisted: false, title: manualDraft.title, description: manualDraft.description })),
      button('Cancelar', () => runAction('reject'), true))
  } else if (run.status === 'waiting_approval') {
    box.append(element('p', 'Revisá el documento. Se guardará como privado en Ambiguous; este paso no envía mensajes.'))
    box.append(element('h3', run.draft?.title), element('pre', run.draft?.content, 'preview'))
    box.append(button('Aprobar y guardar en Ambiguous', () => runAction('approve', { approved: true })), button('Rechazar · no guardar', () => runAction('reject'), true))
  } else if (run.status === 'writing') {
    box.append(element('p', 'Guardando en Ambiguous…'), button('Consultar estado', () => { void act(refresh) }, true))
  } else if (run.status === 'succeeded' || run.status === 'created') {
    box.append(element('h3', run.status === 'succeeded' ? 'Documento creado y leído de vuelta ✓' : 'Documento creado; falta verificar'))
    box.append(element('p', `ID en Ambiguous: ${run.documentId}`, 'mono'))
    if (run.verifiedAt) box.append(element('p', `Última lectura: ${new Date(run.verifiedAt).toLocaleTimeString()}`, 'muted'))
    box.append(element('p', `En Docs, buscá “${run.draft?.title}”.`))
    box.append(button('Volver a leer desde Ambiguous', () => runAction('verify'), true), button('Siguiente tarea', () => { selected = undefined; render() }))
  } else if (run.status === 'rejected') {
    box.append(element('p', 'Cancelado. No se creó ningún documento.'), button('Siguiente tarea', () => { selected = undefined; render() }))
  } else {
    box.append(element('h3', 'Resultado de escritura incierto'), element('p', 'Revisá Docs antes de continuar. Esta corrida no permite reenviar la creación.'), button('Volver a las tareas', () => { selected = undefined; render() }, true))
  }
  if (run.error) box.append(element('p', run.error, 'error'))
  return box
}
function render() {
  root.replaceChildren()
  root.append(element('p', 'TU TRABAJO, CON MENOS REPETICIÓN', 'eyebrow'), element('h1', 'Déjà Vu'), element('p', 'Traspasos de tareas, sin prompts.', 'intro'))
  if (busy) root.append(element('p', 'Procesando…', 'notice'))
  if (error) { const box = card(element('p', error, 'error'), button('Reintentar lectura', () => { void act(refresh) }, true)); box.setAttribute('role', 'alert'); root.append(box) }
  if (!state) {
    const field = input('Token del core local', 'password')
    const connect = button('Conectar', () => {
      const token = field.node.value.trim()
      void act(async () => {
        if (token.length < 24) throw new Error('Usá CORE_INGEST_TOKEN de .env (mínimo 24 caracteres).')
        await chrome.storage.local.set({ coreToken: token }); await refresh()
      })
    })
    root.append(card(element('h2', 'Conectá tu workspace'), element('p', 'Iniciá el core y pegá su token local. La clave de Ambiguous permanece en el servidor.'), field.wrapper, connect))
  } else {
    root.append(element('p', identity, 'muted'))
    const observation = card(element('p', state.paused ? 'Observación pausada' : 'Observando solo acciones de este panel', 'eyebrow'), element('p', `${state.metrics.manualCompleted} manuales · ${state.metrics.assistedCompleted} asistidos · ${state.metrics.observedEvents} eventos`))
    observation.append(button(state.paused ? 'Reanudar observación' : 'Pausar observación', () => {
      void act(async () => { await api('/v1/observation', { paused: !state!.paused }); await refresh() })
    }, true))
    root.append(observation)
    if (selected) root.append(renderRun(selected))
    else {
      const list = card(element('h2', 'Tareas del workspace'), element('p', 'Abrí una tarea, prepará su traspaso y guardalo. Después de dos vueltas, Déjà Vu puede ofrecer la siguiente.'))
      if (!tasks.length) list.append(element('p', 'No hay tareas en esta página. Creá tareas de prueba en Ambiguous o volvé al inicio.'))
      for (const task of tasks) list.append(button(task.title, () => {
        void act(async () => {
          if (pendingOpen?.taskId !== task.id) pendingOpen = { taskId: task.id, id: crypto.randomUUID() }
          selected = await api<Run>('/v1/runs', pendingOpen); pendingOpen = undefined; await refresh()
        })
      }, true))
      if (cursor) list.append(button('Más tareas', () => { void act(async () => { taskCursor = cursor!; await refresh() }) }, true))
      if (hasMoreTasks && !cursor) list.append(element('p', 'Ambiguous no devolvió cursor para continuar esta lista.'))
      if (taskCursor) list.append(button('Primera página', () => { void act(async () => { taskCursor = undefined; await refresh() }) }, true))
      root.append(list)
    }
    const history = card(element('h2', `Historial · ${state.meta.total}`))
    if (!state.data.length) history.append(element('p', 'Todavía no hay traspasos.'))
    for (const run of state.data) history.append(button(`${run.task.title} · ${run.status}`, () => { selected = run; render() }, true))
    if (state.meta.hasMore) history.append(button('Más historial', () => { void act(async () => { historyOffset += 20; await refresh() }) }, true))
    if (historyOffset) history.append(button('Historial reciente', () => { void act(async () => { historyOffset = 0; await refresh() }) }, true))
    root.append(history, button('Actualizar desde Ambiguous', () => { void act(refresh) }, true))
  }
  root.append(element('p', 'MVP · plantilla fija · un workspace · no observa otras apps ni campos de la página.', 'footer'))
  root.querySelectorAll('button').forEach(node => { node.disabled = busy })
}
render()
void act(async () => { const { coreToken } = await chrome.storage.local.get('coreToken'); if (coreToken) await refresh() })
