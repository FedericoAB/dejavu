import { button, card, element, input, link } from './shared/ui.js'

type Run = {
  id: string; task: { title: string; description: string | null; status: string; priority: string }
  status: 'opened' | 'waiting_approval' | 'writing' | 'created' | 'succeeded' | 'rejected' | 'uncertain'
  mode: string; draft?: { title: string; content: string }; documentId?: string
  verifiedAt?: string; error?: string; offer?: { support: number; medianDurationMs: number }
}
type State = {
  paused: boolean; data: Run[]; meta: { total: number; hasMore: boolean }
  metrics: { manualCompleted: number; assistedCompleted: number; observedEvents: number }
}
const statusLabels: Record<Run['status'], string> = {
  opened: 'En preparación', waiting_approval: 'Espera tu aprobación', writing: 'Guardando',
  created: 'Pendiente de verificación', succeeded: 'Verificado', rejected: 'Cancelado', uncertain: 'Revisar en Docs',
}
const root = document.getElementById('app')!
const hiddenOffers = new Set<string>()
const offerDeadlines = new Map<string, number>()
let offerTimer: ReturnType<typeof setTimeout> | undefined
let state: State | undefined
let identity = ''
let identityError = ''
let tasks: { id: string; title: string }[] = []
let taskError = ''
let cursor: string | null = null
let hasMoreTasks = false
let taskCursor: string | undefined
let selected: Run | undefined
let error = ''
let busy = false
let hasCredentials = false
let tokenDraft = ''
let unreadRunId: string | undefined
let historyOffset = 0
let historyExpanded = false
let pendingOpen: { taskId: string; id: string } | undefined
let manualDraft = { runId: '', title: '', description: '' }

const messageOf = (error: unknown) => error instanceof Error ? error.message : 'No se pudo completar la acción.'
async function api<T>(path: string, body?: unknown): Promise<T> {
  const result = await chrome.runtime.sendMessage({ type: 'api', path, ...(body === undefined ? {} : { body }) })
  if (!result || result.error) {
    if (result?.code === 'UNAUTHORIZED') { state = undefined; selected = undefined }
    throw new Error(result?.error ?? 'El core no respondió. Iniciá el proyecto con pnpm dev.')
  }
  return result.data as T
}
async function refresh() {
  const [snapshot, list, who] = await Promise.allSettled([
    api<State>(`/v1/state?offset=${historyOffset}`),
    api<{ data: typeof tasks; meta: { nextCursor: string | null; hasMore: boolean } }>(`/v1/tasks${taskCursor ? `?cursor=${encodeURIComponent(taskCursor)}` : ''}`),
    api<{ display_name: string; type: string }>('/v1/workspace'),
  ])
  if (snapshot.status === 'rejected') throw snapshot.reason
  state = snapshot.value
  if (list.status === 'fulfilled') {
    tasks = list.value.data; cursor = list.value.meta.nextCursor; hasMoreTasks = list.value.meta.hasMore; taskError = ''
  } else taskError = messageOf(list.reason)
  if (who.status === 'fulfilled') { identity = `${who.value.display_name} · ${who.value.type}`; identityError = '' }
  else identityError = messageOf(who.reason)
  if (selected) {
    selected = await api<Run>(`/v1/runs/${selected.id}`)
    unreadRunId = undefined
  } else selected = state.data.find(run => ['opened', 'waiting_approval', 'writing'].includes(run.status))
}
async function act(action: () => Promise<void>) {
  if (busy) return
  const focusedKey = (document.activeElement as HTMLElement | null)?.dataset.focusKey
  busy = true; error = ''; render()
  try { await action() } catch (failure) { error = messageOf(failure) }
  finally { busy = false; render(focusedKey) }
}
function runAction(action: string, body: unknown = {}) {
  const run = selected
  if (!run) return
  void act(async () => {
    try { selected = await api<Run>(`/v1/runs/${run.id}/${action}`, body) }
    catch (failure) {
      // Una respuesta perdida nunca habilita otra escritura sin consultar primero.
      try { selected = await api<Run>(`/v1/runs/${run.id}`); unreadRunId = undefined }
      catch { unreadRunId = run.id }
      throw failure
    }
    await refresh()
  })
}
function closeOffer(runId: string) {
  hiddenOffers.add(runId)
  const hadFocus = document.activeElement?.closest('.offer')
  render(hadFocus ? 'input:Título de la tarea' : undefined)
}
function renderOffer(run: Run) {
  if (!run.offer || run.status !== 'opened' || hiddenOffers.has(run.id) || unreadRunId === run.id) return
  if (!offerDeadlines.has(run.id)) offerDeadlines.set(run.id, Date.now() + 30_000)
  const remaining = offerDeadlines.get(run.id)! - Date.now()
  if (remaining <= 0) { hiddenOffers.add(run.id); return }
  const offer = card()
  offer.classList.add('offer')
  offer.setAttribute('role', 'dialog'); offer.setAttribute('aria-modal', 'false')
  offer.setAttribute('aria-live', 'polite'); offer.setAttribute('aria-labelledby', 'offer-title')
  const heading = element('h2', `Hiciste esto ${run.offer.support} veces.`)
  heading.id = 'offer-title'
  const close = button('×', () => closeOffer(run.id), true)
  close.classList.add('offer-close'); close.dataset.allowBusy = 'true'; close.setAttribute('aria-label', 'Cerrar sugerencia sin silenciar futuras ofertas')
  const steps = element('ol', undefined, 'offer-steps')
  for (const step of ['Leer tarea', 'Preparar', 'Guardar']) steps.append(element('li', step))
  const parameters = element('p', undefined, 'offer-task')
  parameters.append(element('strong', run.task.title))
  offer.append(close, heading, element('p', `3 pasos · ~${Math.max(1, Math.round(run.offer.medianDurationMs / 1000))} s cada vez`, 'muted'), steps, parameters,
    element('p', 'Preparo el documento; vos aprobás el guardado.'),
    actions(button('Sí, hacelo', () => runAction('prepare', { assisted: true })), button('No', () => runAction('dismiss'), true)),
    element('p', '«No» silencia 24 h · Escape cierra · Expira en 30 s.', 'offer-hint'))
  offer.addEventListener('keydown', event => {
    // El foco solo se contiene cuando el usuario ya entró a la tarjeta.
    if (event.key !== 'Tab') return
    const controls = Array.from(offer.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  })
  offerTimer = setTimeout(() => closeOffer(run.id), remaining)
  return offer
}
function leaveRun() { selected = undefined; unreadRunId = undefined; render() }
function actions(...controls: HTMLElement[]) {
  const group = element('div', undefined, 'actions')
  group.append(...controls)
  return group
}
function renderRun(run: Run) {
  const box = card(element('h2', run.draft?.title ?? run.task.title))
  const meta = element('div', undefined, 'run-meta')
  meta.append(element('span', run.mode === 'assisted' ? 'Asistido' : 'Manual', 'muted'), element('span', statusLabels[run.status], `badge ${run.status === 'succeeded' ? 'success' : ''}`))
  box.append(meta)
  if (unreadRunId === run.id) {
    box.append(element('p', 'Conexión interrumpida. Consultá el estado antes de continuar: la acción pudo completarse.', 'error'), button('Consultar estado de la corrida', () => { void act(refresh) }, true))
    return box
  }
  if (run.status === 'opened') {
    if (manualDraft.runId !== run.id) manualDraft = { runId: run.id, title: '', description: '' }
    const title = input('Título de la tarea')
    title.node.value = manualDraft.title; title.node.maxLength = 255; title.node.required = true
    title.node.placeholder = 'Copiá el título de arriba'
    title.node.oninput = () => { manualDraft.title = title.node.value }
    const source = element('div', run.task.description || 'Sin descripción.', 'task-context')
    source.tabIndex = 0; source.setAttribute('aria-label', 'Descripción de origen')
    const description = element('textarea')
    description.rows = 3; description.value = manualDraft.description; description.maxLength = 12_000
    description.placeholder = 'Copiá la descripción; vacía si no tiene'
    description.dataset.focusKey = 'input:Descripción de la tarea'
    description.oninput = () => { manualDraft.description = description.value }
    const label = element('label', 'Descripción de la tarea')
    label.append(description)
    const form = element('form')
    const prepare = button('Preparar documento', () => {})
    prepare.type = 'submit'
    form.onsubmit = event => { event.preventDefault(); runAction('prepare', { assisted: false, title: manualDraft.title, description: manualDraft.description }) }
    form.append(title.wrapper, source, label, actions(prepare, button('Cancelar', () => runAction('reject'), true)))
    box.append(element('p', `${run.task.status} · ${run.task.priority}`, 'muted'), form)
  } else if (run.status === 'waiting_approval') {
    const preview = element('pre', run.draft?.content, 'preview')
    preview.tabIndex = 0; preview.setAttribute('aria-label', 'Vista previa exacta del documento')
    box.append(element('p', 'Se guardará con acceso restringido en Ambiguous.', 'muted'), preview,
      actions(button('Aprobar y guardar', () => runAction('approve', { approved: true })), button('Rechazar', () => runAction('reject'), true)))
  } else if (run.status === 'writing') {
    box.append(element('p', 'Guardando en Ambiguous…'), button('Consultar estado', () => { void act(refresh) }, true))
  } else if (run.status === 'succeeded' || run.status === 'created') {
    box.append(element('p', run.status === 'succeeded' ? 'Creado y leído de vuelta en Ambiguous ✓' : 'Creado. Falta verificar la lectura.'))
    const details = element('details', undefined, 'document-details')
    details.append(element('summary', 'Detalles del documento'), element('p', `ID: ${run.documentId}`, 'mono'))
    if (run.verifiedAt) details.append(element('p', `Verificado: ${new Date(run.verifiedAt).toLocaleString('es-PY')}`, 'muted'))
    details.append(element('p', 'Buscalo por su título en Docs de Ambiguous.', 'muted'))
    box.append(details, actions(button('Volver a leer', () => runAction('verify'), true), button('Siguiente tarea', leaveRun)))
  } else if (run.status === 'rejected') {
    box.append(element('p', 'No se creó ningún documento.'), button('Siguiente tarea', leaveRun))
  } else {
    box.append(element('p', 'Revisá Docs antes de continuar. Esta corrida no reenvía la creación.'), button('Volver a las tareas', leaveRun, true))
  }
  if (run.error) box.append(element('p', run.error, 'error'))
  return box
}
function disconnect() {
  void act(async () => {
    await chrome.storage.local.remove('coreToken')
    state = undefined; selected = undefined; hasCredentials = false; identity = ''; tasks = []; taskError = ''; identityError = ''
    tokenDraft = ''; unreadRunId = undefined; taskCursor = undefined; historyOffset = 0; pendingOpen = undefined
    manualDraft = { runId: '', title: '', description: '' }
  })
}
function render(focusedKey?: string) {
  const restoreKey = focusedKey ?? (document.activeElement as HTMLElement | null)?.dataset.focusKey
  if (offerTimer) clearTimeout(offerTimer)
  root.replaceChildren()
  root.setAttribute('aria-busy', String(busy))
  const header = element('header', undefined, 'panel-header')
  const navigation = element('nav')
  navigation.setAttribute('aria-label', 'Déjà Vu local')
  navigation.append(link('Tablero ↗', 'http://127.0.0.1:3000'), link('Configuración ↗', 'http://127.0.0.1:3000/settings'))
  header.append(element('h1', 'Déjà Vu'), navigation)
  root.append(header)
  if (busy) { const notice = element('p', state ? 'Actualizando…' : 'Conectando…', 'notice'); notice.setAttribute('role', 'status'); root.append(notice) }
  if (error) {
    const box = card(element('p', error, 'error'))
    if (hasCredentials) box.append(button('Reintentar lectura', () => { void act(refresh) }, true))
    box.setAttribute('role', 'alert'); root.append(box)
  }
  if (!state) {
    const field = input('Token del core local', 'password')
    field.node.value = tokenDraft; field.node.minLength = 24; field.node.required = true; field.node.placeholder = 'CORE_INGEST_TOKEN'
    field.node.oninput = () => { tokenDraft = field.node.value }
    const form = element('form')
    const connect = button('Conectar', () => {})
    connect.type = 'submit'
    form.onsubmit = event => {
      event.preventDefault()
      void act(async () => {
        const token = tokenDraft.trim()
        if (token.length < 24) throw new Error('Usá CORE_INGEST_TOKEN de .env (mínimo 24 caracteres).')
        await chrome.storage.local.set({ coreToken: token }); hasCredentials = true; await refresh(); tokenDraft = ''
      })
    }
    form.append(field.wrapper, connect)
    root.append(card(element('h2', 'Conectar panel'), form))
  } else {
    if (identityError) { const notice = element('p', identityError, 'error'); notice.setAttribute('role', 'alert'); root.append(notice) }
    const activeRun = state.data.some(run => ['opened', 'waiting_approval', 'writing'].includes(run.status)) || (selected && ['opened', 'waiting_approval', 'writing'].includes(selected.status))
    const observation = element('section', undefined, 'observation-bar')
    observation.setAttribute('aria-label', 'Estado de observación')
    const info = element('div')
    const status = element('strong', state.paused ? 'Pausada' : 'Observando este panel')
    status.className = state.paused ? 'observation-paused' : 'observation-active'
    info.append(status, element('p', `${state.metrics.manualCompleted} manuales · ${state.metrics.assistedCompleted} asistidos · ${state.metrics.observedEvents} eventos`, 'muted'))
    const pause = button(state.paused ? 'Reanudar' : 'Pausar', () => {
      void act(async () => { await api('/v1/observation', { paused: !state!.paused }); await refresh() })
    }, true)
    pause.disabled = Boolean(activeRun)
    pause.title = activeRun ? 'Terminá o cancelá el traspaso para cambiar la observación.' : 'Cambiar la observación de este panel'
    observation.append(info, pause)
    root.append(observation)
    if (selected) root.append(renderRun(selected))
    else {
      const list = card(element('h2', 'Tareas'))
      if (taskError) list.append(element('p', taskError, 'error'), button('Reintentar tareas', () => { void act(refresh) }, true))
      else {
        if (!tasks.length) list.append(element('p', taskCursor ? 'Sin más tareas en esta página.' : 'Sin tareas en Ambiguous. Actualizá cuando estén disponibles.'))
        for (const task of tasks) {
          const open = button(task.title, () => {
            void act(async () => {
              if (pendingOpen?.taskId !== task.id) pendingOpen = { taskId: task.id, id: crypto.randomUUID() }
              selected = await api<Run>('/v1/runs', pendingOpen); pendingOpen = undefined; await refresh()
            })
          }, true)
          open.dataset.focusKey = `task:${task.id}`
          list.append(open)
        }
        if (cursor) list.append(button('Más tareas', () => { void act(async () => { taskCursor = cursor!; await refresh() }) }, true))
        if (hasMoreTasks && !cursor) list.append(element('p', 'Ambiguous no devolvió cursor para continuar esta lista.'))
      }
      if (taskCursor) list.append(button('Primera página', () => { void act(async () => { taskCursor = undefined; await refresh() }) }, true))
      root.append(list)
    }
    const history = element('details', undefined, 'card history')
    history.open = historyExpanded
    history.ontoggle = () => { if (history.isConnected) historyExpanded = history.open }
    history.append(element('summary', `Historial · ${state.meta.total}`))
    if (!state.data.length) history.append(element('p', historyOffset ? 'No hay más traspasos en esta página.' : 'Todavía no hay traspasos.'))
    for (const run of state.data) {
      const open = button(`${run.task.title} · ${statusLabels[run.status]}`, () => { void act(async () => { selected = await api<Run>(`/v1/runs/${run.id}`); unreadRunId = undefined }) }, true)
      open.dataset.focusKey = `run:${run.id}`
      history.append(open)
    }
    if (state.meta.hasMore) history.append(button('Más historial', () => { void act(async () => { historyOffset += 20; await refresh() }) }, true))
    if (historyOffset) history.append(button('Historial reciente', () => { void act(async () => { historyOffset = 0; await refresh() }) }, true))
    root.append(history)
  }
  if (hasCredentials) {
    const connection = element('footer', undefined, 'connection-bar')
    const controls = actions(button('Actualizar', () => { void act(refresh) }, true), button('Desconectar', disconnect, true))
    controls.lastElementChild?.setAttribute('title', 'Borra el token de la extensión; conserva el historial en el core.')
    if (identity && !identityError) connection.append(element('p', identity, 'muted'))
    connection.append(controls)
    root.append(connection)
  }
  if (state && selected) { const offer = renderOffer(selected); if (offer) root.append(offer) }
  root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>('button, input, textarea').forEach(node => { node.disabled = node.disabled || (busy && node.dataset.allowBusy !== 'true') })
  if (restoreKey) root.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(restoreKey)}"]`)?.focus({ preventScroll: true })
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && selected && root.querySelector('.offer')) { event.preventDefault(); closeOffer(selected.id) }
})
render()
void act(async () => { const { coreToken } = await chrome.storage.local.get('coreToken'); hasCredentials = Boolean(coreToken); if (coreToken) await refresh() })
