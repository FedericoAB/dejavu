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
  const offer = card(element('p', 'UNA REPETICIÓN, UNA OPORTUNIDAD', 'eyebrow'))
  offer.classList.add('offer')
  offer.setAttribute('role', 'dialog'); offer.setAttribute('aria-modal', 'false')
  offer.setAttribute('aria-live', 'polite'); offer.setAttribute('aria-labelledby', 'offer-title')
  const heading = element('h2', `Hiciste esto ${run.offer.support} veces.`)
  heading.id = 'offer-title'
  const close = button('×', () => closeOffer(run.id), true)
  close.classList.add('offer-close'); close.dataset.allowBusy = 'true'; close.setAttribute('aria-label', 'Cerrar sugerencia sin silenciar futuras ofertas')
  const steps = element('ol', undefined, 'offer-steps')
  for (const step of ['Leer la tarea', 'Preparar el traspaso', 'Guardar el documento']) steps.append(element('li', step))
  const parameters = element('p', 'Para esta tarea: ')
  parameters.append(element('strong', run.task.title))
  offer.append(close, heading, element('p', `3 pasos · ~${Math.max(1, Math.round(run.offer.medianDurationMs / 1000))} s cada vez`, 'muted'), steps, parameters,
    element('p', 'Completo los campos por vos. Después revisás el documento y aprobás su guardado.'),
    button('Sí, hacelo', () => runAction('prepare', { assisted: true })),
    button('No · silenciar por 24 h', () => runAction('dismiss'), true),
    element('p', 'Se cierra a los 30 s. Escape cierra solo esta sugerencia.', 'offer-hint'))
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
function renderRun(run: Run) {
  const box = card(element('p', run.mode === 'assisted' ? 'TRASPASO ASISTIDO' : 'TRASPASO MANUAL', 'eyebrow'), element('h2', run.task.title))
  box.append(element('p', `${run.task.status} · ${run.task.priority}`, 'muted'), element('span', statusLabels[run.status], `badge ${run.status === 'succeeded' ? 'success' : ''}`))
  if (unreadRunId === run.id) {
    box.append(element('p', 'Se perdió la conexión durante la acción. Consultá el estado antes de continuar; el servidor puede haberla recibido.', 'error'), button('Consultar estado de la corrida', () => { void act(refresh) }, true))
    return box
  }
  if (run.status === 'opened') {
    box.append(element('h3', 'Contexto de origen'), element('p', run.task.description || 'Esta tarea no tiene descripción.', 'task-context'))
    if (manualDraft.runId !== run.id) manualDraft = { runId: run.id, title: '', description: '' }
    box.append(element('p', 'Copiá el título y la descripción de arriba a estos campos. Déjà Vu reconoce esta secuencia; la próxima vez podrá completarlos por vos.'))
    const title = input('Título de la tarea')
    title.node.value = manualDraft.title; title.node.maxLength = 255; title.node.required = true
    title.node.oninput = () => { manualDraft.title = title.node.value }
    const description = element('textarea')
    description.rows = 4; description.value = manualDraft.description; description.maxLength = 12_000
    description.dataset.focusKey = 'input:Descripción de la tarea'
    description.oninput = () => { manualDraft.description = description.value }
    const label = element('label', 'Descripción de la tarea (vacía si no tiene)')
    label.append(description)
    const form = element('form')
    const prepare = button('Preparar con los datos copiados', () => {})
    prepare.type = 'submit'
    form.onsubmit = event => { event.preventDefault(); runAction('prepare', { assisted: false, title: manualDraft.title, description: manualDraft.description }) }
    form.append(title.wrapper, label, prepare)
    box.append(form, button('Cancelar traspaso', () => runAction('reject'), true))
  } else if (run.status === 'waiting_approval') {
    box.append(element('p', 'Revisá la vista previa exacta. Se guardará como documento privado en Ambiguous.'))
    box.append(element('h3', run.draft?.title), element('pre', run.draft?.content, 'preview'))
    box.append(button('Aprobar y guardar en Ambiguous', () => runAction('approve', { approved: true })), button('Rechazar · no guardar', () => runAction('reject'), true))
  } else if (run.status === 'writing') {
    box.append(element('p', 'Guardando en Ambiguous… Consultar el estado solo lee el resultado.'), button('Consultar estado', () => { void act(refresh) }, true))
  } else if (run.status === 'succeeded' || run.status === 'created') {
    box.append(element('h3', run.status === 'succeeded' ? 'Documento creado y leído de vuelta ✓' : 'Documento creado; falta verificar'))
    box.append(element('p', `ID en Ambiguous: ${run.documentId}`, 'mono'))
    if (run.verifiedAt) box.append(element('p', `Última lectura: ${new Date(run.verifiedAt).toLocaleString('es-PY')}`, 'muted'))
    box.append(element('p', `En Docs, buscá “${run.draft?.title}”.`))
    box.append(button('Volver a leer desde Ambiguous', () => runAction('verify'), true), button('Siguiente tarea', leaveRun))
  } else if (run.status === 'rejected') {
    box.append(element('p', 'Cancelado. No se creó ningún documento.'), button('Siguiente tarea', leaveRun))
  } else {
    box.append(element('h3', 'Resultado de escritura incierto'), element('p', 'Revisá Docs antes de continuar. Esta corrida no permite reenviar la creación.'), button('Volver a las tareas', leaveRun, true))
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
  root.append(element('p', 'TU TRABAJO, CON MENOS REPETICIÓN', 'eyebrow'), element('h1', 'Déjà Vu'), element('p', 'Traspasos de tareas, sin prompts.', 'intro'), link('Abrir tablero ↗', 'http://127.0.0.1:3000'))
  if (busy) { const notice = element('p', state ? 'Actualizando…' : 'Conectando con el core…', 'notice'); notice.setAttribute('role', 'status'); root.append(notice) }
  if (error) {
    const box = card(element('p', error, 'error'))
    if (hasCredentials) box.append(button('Reintentar lectura', () => { void act(refresh) }, true))
    box.setAttribute('role', 'alert'); root.append(box)
  }
  if (!state) {
    const field = input('Token del core local', 'password')
    field.node.value = tokenDraft; field.node.minLength = 24; field.node.required = true
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
    root.append(card(element('h2', 'Conectá tu workspace'), element('p', 'Iniciá el proyecto con pnpm dev y pegá CORE_INGEST_TOKEN de .env. La clave de Ambiguous permanece en el servidor.'), form))
  } else {
    root.append(element('p', identityError ? 'No se pudo leer la identidad del workspace.' : identity, 'muted'))
    if (identityError) root.append(element('p', identityError, 'error'))
    const activeRun = state.data.some(run => ['opened', 'waiting_approval', 'writing'].includes(run.status)) || (selected && ['opened', 'waiting_approval', 'writing'].includes(selected.status))
    const observation = card(element('p', state.paused ? 'Observación pausada' : 'Observando solo acciones de este panel', 'eyebrow'), element('p', `${state.metrics.manualCompleted} manuales · ${state.metrics.assistedCompleted} asistidos · ${state.metrics.observedEvents} eventos`))
    const pause = button(state.paused ? 'Reanudar observación' : 'Pausar observación', () => {
      void act(async () => { await api('/v1/observation', { paused: !state!.paused }); await refresh() })
    }, true)
    pause.disabled = Boolean(activeRun)
    observation.append(pause)
    if (activeRun) observation.append(element('p', 'Terminá o cancelá el traspaso para cambiar la observación.', 'muted'))
    root.append(observation)
    if (selected) root.append(renderRun(selected))
    else {
      const list = card(element('h2', 'Tareas del workspace'), element('p', 'Abrí una tarea, prepará su traspaso y guardalo. Después de dos vueltas, Déjà Vu puede ofrecer la siguiente.'))
      if (taskError) list.append(element('p', taskError, 'error'), button('Reintentar tareas', () => { void act(refresh) }, true))
      else {
        if (!tasks.length) list.append(element('p', taskCursor ? 'No hay más tareas en esta página.' : 'Todavía no hay tareas. Cuando el equipo cargue las tareas en Ambiguous, actualizá esta lista.'))
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
    const history = card(element('h2', `Historial · ${state.meta.total}`))
    if (!state.data.length) history.append(element('p', historyOffset ? 'No hay más traspasos en esta página.' : 'Todavía no hay traspasos.'))
    for (const run of state.data) {
      const open = button(`${run.task.title} · ${statusLabels[run.status]}`, () => { void act(async () => { selected = await api<Run>(`/v1/runs/${run.id}`); unreadRunId = undefined }) }, true)
      open.dataset.focusKey = `run:${run.id}`
      history.append(open)
    }
    if (state.meta.hasMore) history.append(button('Más historial', () => { void act(async () => { historyOffset += 20; await refresh() }) }, true))
    if (historyOffset) history.append(button('Historial reciente', () => { void act(async () => { historyOffset = 0; await refresh() }) }, true))
    root.append(history, button('Actualizar desde Ambiguous', () => { void act(refresh) }, true))
  }
  if (hasCredentials) root.append(button('Desconectar este panel', disconnect, true), element('p', 'Borra el token guardado en esta extensión. El historial permanece en el core.', 'muted'))
  root.append(element('p', 'MVP · plantilla fija · un workspace · no observa otras apps ni campos de la página.', 'footer'))
  if (state && selected) { const offer = renderOffer(selected); if (offer) root.append(offer) }
  root.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLTextAreaElement>('button, input, textarea').forEach(node => { node.disabled = node.disabled || (busy && node.dataset.allowBusy !== 'true') })
  if (restoreKey) root.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(restoreKey)}"]`)?.focus({ preventScroll: true })
}
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && selected && root.querySelector('.offer')) { event.preventDefault(); closeOffer(selected.id) }
})
render()
void act(async () => { const { coreToken } = await chrome.storage.local.get('coreToken'); hasCredentials = Boolean(coreToken); if (coreToken) await refresh() })
