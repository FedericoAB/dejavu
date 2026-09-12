'use client'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { request } from '../core/client'
import { useResource, useSession } from '../core/session'
import type { Metrics, Page, Pattern, Run, Task, Workspace } from '../core/types'
import { Badge, Button, Card, Empty, ErrorState } from '../shared/ui'
import { Heading, Resource, RunList, Stats, duration } from './common'
import styles from './workspace.module.scss'

export function Overview() {
  const { token, refresh } = useSession(), router = useRouter()
  const metrics = useResource<Metrics>('/metrics'), patterns = useResource<Page<Pattern>>('/patterns'), runs = useResource<Page<Run>>('/runs?limit=5')
  const [cursor, setCursor] = useState<string | undefined>()
  const tasks = useResource<Awaited<ReturnType<Workspace['tasks']>>>(`/tasks${cursor ? `?cursor=${cursor}` : ''}`)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const pending = useRef<{ taskId: string; id: string } | undefined>(undefined)
  const lock = useRef(false)
  async function open(task: Task) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      // Una respuesta perdida conserva la misma clave hasta recuperar esta apertura.
      if (pending.current?.taskId !== task.id) pending.current = { taskId: task.id, id: crypto.randomUUID() }
      const run = await request<Run>(token, '/runs', pending.current)
      pending.current = undefined; refresh(); router.push(`/runs/${run.id}`)
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo abrir la tarea.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function pause() {
    if (lock.current || !metrics.data) return
    lock.current = true; setBusy(true); setError('')
    try { await request(token, '/observation', { paused: !metrics.data.paused }); refresh() }
    catch (error) { setError(error instanceof Error ? error.message : 'No se pudo cambiar la observación.') }
    finally { lock.current = false; setBusy(false) }
  }
  return <><Heading title="Tu trabajo, con menos repetición." description="Prepará un traspaso. Déjà Vu aprende a reconocer la secuencia." />
    {error && <ErrorState message={error} retry={() => { setError(''); refresh() }} />}
    <Resource resource={metrics}>{data => <><div className={styles.observation}><div><strong><span className={`${styles.dot} ${data.paused ? styles.dotPaused : ''}`} />{data.paused ? 'Observación pausada' : 'Reconociendo tus traspasos'}</strong><p>{data.paused ? 'No se registran nuevos eventos mientras la observación está pausada.' : 'Solo se observan las acciones de traspaso en Déjà Vu.'}</p></div><Button secondary onClick={() => void pause()} disabled={busy}>{data.paused ? 'Reanudar observación' : 'Pausar observación'}</Button></div><Stats metrics={data} /></>}</Resource>
    <div className={styles.columns}><div className={styles.stack}><Card><div className={styles.sectionTitle}><h2>Tareas del workspace</h2><Badge>Ambiguous</Badge></div><p className={styles.subtle}>Elegí la tarea cuyo contexto querés dejar listo para otra persona.</p><Resource resource={tasks}>{data => <>
      {!data.data.length ? <Empty title="No hay tareas disponibles">Cuando las tareas estén en tu workspace de Ambiguous, aparecerán acá. Podés actualizar la lectura.</Empty> : <div className={styles.list}>{data.data.map(task => <div className={styles.row} key={task.id}><div><h3>{task.title}</h3><p>{task.status} · {task.priority}{task.due_date ? ` · ${task.due_date.slice(0, 10)}` : ''}</p></div><Button secondary disabled={busy} onClick={() => void open(task)}>Preparar <span aria-hidden="true">↗</span></Button></div>)}</div>}
      <div className={styles.actions}><Button secondary onClick={tasks.retry} disabled={busy || tasks.loading}>Actualizar tareas</Button>{cursor && <Button secondary disabled={busy} onClick={() => setCursor(undefined)}>Primera página</Button>}{data.meta.hasMore && data.meta.nextCursor && <Button secondary disabled={busy} onClick={() => setCursor(data.meta.nextCursor!)}>Más tareas →</Button>}</div>
    </>}</Resource></Card><Card><div className={styles.sectionTitle}><h2>Últimos traspasos</h2><Link href="/runs">Ver historial →</Link></div><Resource resource={runs}>{data => <RunList runs={data.data} />}</Resource></Card></div>
      <div className={styles.stack}><Card><p className={styles.eyebrow}>LA PRÓXIMA VEZ</p><h2>Una rutina en formación</h2><Resource resource={patterns}>{data => data.data.length ? <>{data.data.map(pattern => <div className={styles.pattern} key={pattern.id}><h3>Hiciste esto {pattern.support} veces.</h3><p>3 pasos · {duration(pattern.medianDurationMs)} por traspaso. Al abrir otra tarea, Déjà Vu puede ofrecer prepararla.</p></div>)}</> : <p className={styles.subtle}>Después de dos traspasos manuales verificados, Déjà Vu puede reconocer el patrón y ofrecer preparar el siguiente.</p>}</Resource><ol className={styles.steps}><li>Abrir la tarea</li><li>Copiar título y contexto</li><li>Aprobar y guardar el documento</li></ol><Link href="/routines/task-handoff">Ver cómo funciona →</Link><p className={styles.note}>La oferta necesita dos vueltas completas y una duración mediana de al menos 5 segundos.</p></Card><Card><h2>Siempre tenés la última palabra.</h2><p className={styles.subtle}>Revisás el documento completo antes de guardarlo. Si lo rechazás, no se escribe nada.</p><Badge tone="green">Aprobación en cada traspaso</Badge></Card></div></div>
  </>
}
