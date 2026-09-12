'use client'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { request, stream } from '../core/client'
import { useSession } from '../core/session'
import type { Run } from '../core/types'
import { Badge, Button, Card, ErrorState, Input, Loading, Textarea } from '../shared/ui'
import { Status, date, duration } from './common'
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
  return <>{error && <ErrorState message={error} retry={() => { if (run) void read(); else setAttempt(value => value + 1) }} />}
    {!run ? !error && <Loading /> : <Card>
      <div className={styles.runHeader}><div><h2>{run.task.title}</h2><span className={styles.subtle}>{run.mode === 'assisted' ? 'Asistido' : 'Manual'} · {date(run.openedAt)}</span></div><Status run={run} /></div>
      <Timeline run={run} live={live} />
      {run.status === 'opened' && <form onSubmit={prepare}><div className={styles.editorGrid}><section><h3>Origen</h3><div className={styles.sourceTitle}>{run.task.title}</div><div className={styles.taskContext}>{run.task.description || 'Sin descripción'}</div><p className={styles.subtle}>{run.task.status} · {run.task.priority}</p></section><section><h3>Traspaso</h3><Input label="Título de la tarea" value={title} onChange={event => setTitle(event.target.value)} required maxLength={255} disabled={disabled} /><Textarea label="Descripción de la tarea" value={description} onChange={event => setDescription(event.target.value)} rows={6} maxLength={12000} disabled={disabled} /></section></div><div className={styles.actionBar}><Button type="button" secondary disabled={disabled} onClick={() => void act('reject')}>Cancelar</Button><Button type="submit" disabled={disabled}>Preparar documento</Button></div></form>}
      {run.status === 'waiting_approval' && <><div className={styles.sectionTitle}><h3>{run.draft?.title}</h3><Badge>Acceso restringido</Badge></div><pre className={styles.preview} tabIndex={0} aria-label="Contenido del documento a aprobar">{run.draft?.content}</pre><div className={styles.actionBar}><Button secondary disabled={disabled} onClick={() => void act('reject')}>Rechazar</Button><Button disabled={disabled} onClick={() => void act('approve', { approved: true })}>{busy ? 'Guardando…' : 'Aprobar y guardar'}</Button></div></>}
      {run.status === 'writing' && <div className={styles.stateCompact}><h3 role="status">Guardando en Ambiguous…</h3><Button secondary disabled={busy} onClick={() => void read()}>Consultar estado</Button></div>}
      {['succeeded', 'created'].includes(run.status) && <><div className={styles.resultBar}><div><strong>{run.status === 'succeeded' ? 'Documento verificado' : 'Lectura pendiente'}</strong>{run.verifiedAt && <span>{date(run.verifiedAt)}</span>}</div><Button secondary disabled={disabled} onClick={() => void act('verify')}>Volver a leer</Button></div><details className={styles.documentDetails}><summary>{run.draft?.title}</summary><pre className={styles.preview} tabIndex={0} aria-label="Contenido aprobado">{run.draft?.content}</pre><p className={styles.identifier}>ID: {run.documentId}</p></details><div className={styles.actionBar}><a href="https://app.ambiguous.ai/" target="_blank" rel="noreferrer">Ambiguous ↗</a><Link href="/">Siguiente tarea →</Link></div></>}
      {run.status === 'rejected' && <div className={styles.stateCompact}><h3>Traspaso cancelado</h3><p>Sin guardar.</p><Link href="/">Siguiente tarea →</Link></div>}
      {run.status === 'uncertain' && <div className={styles.stateCompact}><Badge tone="amber">Revisión necesaria</Badge><h3>Guardado sin confirmar</h3><p>Buscá «{run.draft?.title}» en Docs antes de repetir.</p><a href="https://app.ambiguous.ai/" target="_blank" rel="noreferrer">Ambiguous ↗</a></div>}
      {run.error && <ErrorState message={run.error} />}{needsRead && <p className={styles.note}>Reintentá la lectura antes de continuar.</p>}
      {run.status === 'opened' && run.offer && <Offer run={run} busy={disabled} accept={() => void act('prepare', { assisted: true })} dismiss={() => void act('dismiss')} />}
    </Card>}
  </>
}
function Timeline({ run, live }: { run: Run; live: boolean }) {
  const steps = [
    { title: 'Preparar', done: !!run.draft, current: run.status === 'opened' },
    { title: 'Aprobar', done: !!run.approvedAt || ['writing', 'created', 'succeeded', 'uncertain'].includes(run.status), current: run.status === 'waiting_approval' },
    { title: 'Guardar', done: !!run.documentId, current: run.status === 'writing' },
    { title: 'Verificar', done: run.status === 'succeeded', current: run.status === 'created' },
  ]
  return <div className={styles.progressRow}><ol className={styles.progress}>{steps.map((step, index) => <li key={step.title} className={step.done ? styles.progressDone : step.current ? styles.progressCurrent : ''}><span aria-label={step.done ? 'Completado' : step.current ? 'En curso' : 'Pendiente'}>{step.done ? '✓' : index + 1}</span>{step.title}</li>)}</ol><span className={styles.liveIndicator} title={live ? 'Seguimiento en vivo' : 'Reconectando'} aria-label={live ? 'Seguimiento en vivo' : 'Reconectando'} data-live={live} /></div>
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
  }}><button className={styles.close} aria-label="Cerrar oferta" onClick={hide}>×</button><h2 id="offer-title">Hiciste esto {run.offer?.support} veces.</h2><p>3 pasos · {duration(run.offer?.medianDurationMs)} cada vez.</p><div className={styles.actions}><Button disabled={busy} onClick={accept}>Sí, preparalo</Button><Button secondary disabled={busy} onClick={dismiss}>No</Button></div><p><small>No: silenciar por 24 h.</small></p></section>
}
