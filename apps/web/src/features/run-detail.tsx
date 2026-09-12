'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { request, stream } from '../core/client'
import { useSession } from '../core/session'
import type { Run } from '../core/types'
import { Badge, Button, Card, ErrorState, Input, Loading, Textarea } from '../shared/ui'
import { Heading, Status, date, duration } from './common'
import styles from './workspace.module.scss'

export function RunDetail({ id }: { id: string }) {
  const { token, refresh } = useSession()
  const [run, setRun] = useState<Run>(), [error, setError] = useState(''), [busy, setBusy] = useState(false)
  const [live, setLive] = useState(false), [needsRead, setNeedsRead] = useState(false), [attempt, setAttempt] = useState(0)
  const [title, setTitle] = useState(''), [description, setDescription] = useState('')
  const lock = useRef(false)
  const acceptRun = useCallback((next: Run) => setRun(current => current?.id === next.id && (current.revision ?? 0) > (next.revision ?? 0) ? current : next), [])
  useEffect(() => {
    setRun(undefined); setError(''); setTitle(''); setDescription(''); setNeedsRead(false)
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    request<Run>(token, `/runs/${id}`, undefined, controller.signal).then(acceptRun).catch(error => { if (!controller.signal.aborted) setError(error.message) })
    const connect = () => {
      stream(token, `/runs/${id}/stream`, controller.signal, (event, data) => {
        if (event === 'run') { acceptRun(data as Run); setLive(true) }
      }).catch(() => { if (!controller.signal.aborted) { setLive(false); timer = setTimeout(connect, 4000) } })
    }
    connect()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [id, token, attempt, acceptRun])
  async function read() {
    if (lock.current) return
    lock.current = true; setBusy(true)
    try { acceptRun(await request<Run>(token, `/runs/${id}`)); setNeedsRead(false); setError(''); refresh() }
    catch (error) { setError(error instanceof Error ? error.message : 'No pudimos leer el traspaso.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function act(action: string, body: unknown = {}) {
    if (lock.current || needsRead) return
    lock.current = true; setBusy(true); setError('')
    try { acceptRun(await request<Run>(token, `/runs/${id}/${action}`, body)); refresh() }
    catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo completar la acción.')
      // Recuperar el estado primero: el servidor pudo completar el POST.
      setNeedsRead(true)
    } finally { lock.current = false; setBusy(false) }
  }
  function prepare(event: FormEvent) { event.preventDefault(); void act('prepare', { assisted: false, title, description }) }
  const disabled = busy || needsRead
  return <><Link href="/" className={styles.back}>← Volver a las tareas</Link>{error && <ErrorState message={error} retry={() => { if (run) void read(); else setAttempt(value => value + 1) }} />}
    {!run ? !error && <Loading /> : <><Heading title={run.task.title} description={`${run.mode === 'assisted' ? 'Traspaso asistido' : 'Traspaso manual'} · Iniciado ${date(run.openedAt)}`} action={<Status run={run} />} />
      <div className={styles.columns}><Card>
        {run.status === 'opened' && <><p className={styles.eyebrow}>01 · EL CONTEXTO DE ORIGEN</p><h2>{run.task.title}</h2><p className={styles.subtle}>{run.task.status} · {run.task.priority}{run.task.due_date ? ` · Vence ${run.task.due_date.slice(0, 10)}` : ''}</p><div className={styles.taskContext}>{run.task.description || 'Esta tarea no tiene descripción registrada.'}</div><h2>Prepará el traspaso</h2><p className={styles.subtle}>Copiá el título y la descripción de la tarea. Esta secuencia permite reconocer cuándo ofrecerte ayuda.</p><form onSubmit={prepare}><Input label="Título de la tarea" value={title} onChange={event => setTitle(event.target.value)} required maxLength={255} disabled={disabled} /><Textarea label="Descripción de la tarea (vacía si no tiene)" value={description} onChange={event => setDescription(event.target.value)} rows={5} maxLength={12000} disabled={disabled} /><div className={styles.actions}><Button type="submit" disabled={disabled}>Preparar documento</Button><Button type="button" secondary disabled={disabled} onClick={() => void act('reject')}>Cancelar traspaso</Button></div></form></>}
        {run.status === 'waiting_approval' && <><p className={styles.eyebrow}>02 · TU APROBACIÓN</p><h2>Revisá antes de guardar.</h2><p className={styles.subtle}>Este es el contenido que se guardará como documento con acceso restringido en Ambiguous.</p><h3>{run.draft?.title}</h3><pre className={styles.preview} tabIndex={0} aria-label="Contenido del documento a aprobar">{run.draft?.content}</pre><div className={styles.actions}><Button disabled={disabled} onClick={() => void act('approve', { approved: true })}>{busy ? 'Procesando…' : 'Aprobar y guardar'}</Button><Button secondary disabled={disabled} onClick={() => void act('reject')}>Rechazar · no guardar</Button></div></>}
        {run.status === 'writing' && <><p className={styles.eyebrow}>03 · GUARDANDO EN AMBIGUOUS</p><h2>Tu documento está en camino.</h2><p role="status">El servidor está guardando el documento. El estado se actualizará en vivo.</p><Button secondary disabled={busy} onClick={() => void read()}>Consultar estado</Button></>}
        {['succeeded', 'created'].includes(run.status) && <><div className={styles.success}><Badge tone="green">{run.status === 'succeeded' ? 'Resultado verificado' : 'Documento creado'}</Badge><h2 style={{ marginTop: 16 }}>{run.status === 'succeeded' ? 'Contexto listo para continuar.' : 'Falta confirmar la lectura.'}</h2><p>{run.status === 'succeeded' ? 'El documento se guardó y se leyó de vuelta desde Ambiguous.' : 'El documento tiene un ID. Reintentá la lectura para confirmar el resultado.'}</p>{run.verifiedAt && <p className={styles.subtle}>Verificado el {date(run.verifiedAt)}</p>}</div><h3>{run.draft?.title}</h3><pre className={styles.preview} tabIndex={0} aria-label="Contenido aprobado">{run.draft?.content}</pre><p className={styles.identifier}>ID del documento: {run.documentId}</p><p className={styles.subtle}>Podés buscarlo por su título en Docs de Ambiguous.</p><div className={styles.actions}><Button secondary disabled={disabled} onClick={() => void act('verify')}>Volver a leer desde Ambiguous</Button><Link href="/">Preparar otro traspaso →</Link></div></>}
        {run.status === 'rejected' && <><Badge>Cancelado</Badge><h2 style={{ marginTop: 18 }}>Este documento no se guardó.</h2><p>El traspaso quedó rechazado. Podés continuar con otra tarea.</p><Link href="/">Volver a las tareas →</Link></>}
        {run.status === 'uncertain' && <><Badge tone="amber">Revisión necesaria</Badge><h2 style={{ marginTop: 18 }}>No se pudo confirmar el guardado.</h2><p>Buscá el documento por su título en Docs de Ambiguous antes de preparar otro. Esta corrida no vuelve a enviar la creación.</p><h3>{run.draft?.title}</h3><a href="https://app.ambiguous.ai/" target="_blank" rel="noreferrer">Abrir Ambiguous ↗</a></>}
        {run.error && <ErrorState message={run.error} />}{needsRead && <p className={styles.note}>Recuperá el estado con «Reintentar lectura» antes de continuar.</p>}
      </Card><Card><div className={styles.sectionTitle}><h2>El recorrido</h2><Badge tone={live ? 'green' : 'amber'}>{live ? 'En vivo' : 'Reconectando'}</Badge></div><Timeline run={run} /><p className={styles.note}>Cada escritura necesita tu aprobación. Una lectura de verificación puede repetirse sin crear otro documento.</p><p className={styles.identifier}>Traspaso: {run.id}</p></Card></div>
      {run.status === 'opened' && run.offer && <Offer run={run} busy={disabled} accept={() => void act('prepare', { assisted: true })} dismiss={() => void act('dismiss')} />}
    </>}
  </>
}
function Timeline({ run }: { run: Run }) {
  const approved = !!run.approvedAt || ['writing', 'created', 'succeeded', 'uncertain'].includes(run.status)
  const steps = [
    { title: 'Leer la tarea', done: true, current: false, note: date(run.openedAt) },
    { title: 'Preparar el documento', done: !!run.draft, current: run.status === 'opened', note: run.mode === 'assisted' ? 'Con ayuda de Déjà Vu' : 'A partir del contexto copiado' },
    { title: 'Revisar y aprobar', done: approved, current: run.status === 'waiting_approval', note: run.status === 'rejected' ? 'Traspaso rechazado' : 'Tu decisión antes de escribir' },
    { title: 'Guardar en Ambiguous', done: !!run.documentId, current: run.status === 'writing', note: run.status === 'uncertain' ? 'Resultado incierto; revisar Docs' : 'Documento con acceso restringido' },
    { title: 'Verificar el resultado', done: run.status === 'succeeded', current: run.status === 'created', note: 'Lectura del documento creado' },
  ]
  return <ol className={styles.timeline}>{steps.map((step, index) => <li key={step.title}><span className={step.done ? styles.done : step.current ? styles.current : ''} aria-label={step.done ? 'Completado' : step.current ? 'En curso' : 'Pendiente'}>{step.done ? '✓' : index + 1}</span><div>{step.title}<small>{step.note}</small></div></li>)}</ol>
}
function Offer({ run, busy, accept, dismiss }: { run: Run; busy: boolean; accept: () => void; dismiss: () => void }) {
  const [visible, setVisible] = useState(true)
  const element = useRef<HTMLElement>(null), returnFocus = useRef<HTMLElement | null>(null)
  const hide = useCallback(() => {
    if (element.current?.contains(document.activeElement)) {
      const fallback = document.querySelector<HTMLInputElement>('main input')
      ;(returnFocus.current?.isConnected ? returnFocus.current : fallback)?.focus()
    }
    setVisible(false)
  }, [])
  useEffect(() => {
    const timeout = setTimeout(hide, 30_000)
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') hide() }
    window.addEventListener('keydown', close)
    return () => { clearTimeout(timeout); window.removeEventListener('keydown', close) }
  }, [run.id, hide])
  if (!visible) return null
  return <section ref={element} className={styles.offer} role="dialog" aria-modal="false" aria-labelledby="offer-title" aria-live="polite" onFocus={event => {
    if (!element.current?.contains(event.relatedTarget) && event.relatedTarget instanceof HTMLElement) returnFocus.current = event.relatedTarget
  }} onKeyDown={event => {
    if (event.key !== 'Tab') return
    const buttons = element.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')
    if (!buttons?.length) return
    const first = buttons[0], last = buttons[buttons.length - 1]
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }}><button className={styles.close} aria-label="Cerrar oferta" onClick={hide}>×</button><p className={styles.eyebrow}>DÉJÀ VU RECONOCIÓ ALGO</p><h2 id="offer-title">Hiciste esto {run.offer?.support} veces.</h2><p>3 pasos · {duration(run.offer?.medianDurationMs)} cada vez.<br />¿Preparo el siguiente traspaso por vos?</p><p><strong>{run.task.title}</strong></p><div className={styles.actions}><Button disabled={busy} onClick={accept}>Sí, preparalo</Button><Button secondary disabled={busy} onClick={dismiss}>No</Button></div><p><small>«No» silencia la oferta por 24 h. Siempre vas a revisar el documento antes de guardarlo.</small></p></section>
}
