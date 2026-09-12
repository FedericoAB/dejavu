'use client'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { request } from '../core/client'
import { useResource, useSession } from '../core/session'
import type { Metrics, Page, Run, Task, Workspace } from '../core/types'
import { Badge, Button, Card, Empty, ErrorState } from '../shared/ui'
import { Heading, Resource } from './common'
import { RunDetail } from './run-detail'
import styles from './workspace.module.scss'

export function Overview({ runId }: { runId?: string }) {
  const { token, refresh } = useSession(), router = useRouter()
  const metrics = useResource<Metrics>('/metrics'), runs = useResource<Page<Run>>('/runs?limit=20')
  const [cursor, setCursor] = useState<string | undefined>()
  const tasks = useResource<Awaited<ReturnType<Workspace['tasks']>>>(`/tasks${cursor ? `?cursor=${cursor}` : ''}`)
  const [busy, setBusy] = useState(false), [error, setError] = useState('')
  const pending = useRef<{ taskId: string; id: string } | undefined>(undefined), lock = useRef(false)
  const active = runs.data?.data.find(run => ['opened', 'waiting_approval', 'writing'].includes(run.status))
  const selected = runId ?? active?.id
  const selectedTaskId = runs.data?.data.find(run => run.id === selected)?.task.id
  async function open(task: Task) {
    if (lock.current) return
    if (active) { router.push(`/runs/${active.id}`); return }
    lock.current = true; setBusy(true); setError('')
    try {
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
  return <><Heading title="Traspasos" action={<Resource resource={metrics}>{data => <div className={styles.toolbar}><Badge tone={data.paused ? 'amber' : 'green'}>{data.paused ? 'Pausado' : 'Observando'}</Badge><Button secondary onClick={() => void pause()} disabled={busy || !!active}>{data.paused ? 'Reanudar' : 'Pausar'}</Button></div>}</Resource>} />
    {error && <ErrorState message={error} retry={() => { setError(''); refresh() }} />}
    <div className={styles.workbench}><Card className={styles.taskPane}><div className={styles.sectionTitle}><h2>Tareas</h2><Button secondary title="Actualizar tareas" aria-label="Actualizar tareas" onClick={tasks.retry} disabled={busy || tasks.loading}>↻</Button></div><Resource resource={tasks}>{data => <>
      {!data.data.length ? <Empty title="Sin tareas" /> : <div className={styles.taskList}>{data.data.map(task => <button type="button" className={`${styles.taskItem} ${task.id === selectedTaskId ? styles.taskSelected : ''}`} key={task.id} disabled={busy || (!!active && active.task.id !== task.id)} onClick={() => void open(task)} aria-label={`Preparar ${task.title}`} aria-current={task.id === selectedTaskId ? 'true' : undefined}><strong>{task.title}</strong><span>{task.status} · {task.priority}</span></button>)}</div>}
      {(cursor || data.meta.hasMore) && <div className={styles.pagination}>{cursor && <Button secondary disabled={busy} onClick={() => setCursor(undefined)}>Primera página</Button>}{data.meta.hasMore && data.meta.nextCursor && <Button secondary disabled={busy} onClick={() => setCursor(data.meta.nextCursor!)}>Más tareas →</Button>}</div>}
    </>}</Resource>{active && <p className={styles.taskHint}><Link href={`/runs/${active.id}`}>Traspaso en curso →</Link></p>}</Card>
    <div className={styles.workArea}>{selected ? <RunDetail key={selected} id={selected} /> : <Card className={styles.workEmpty}><Empty title="Seleccioná una tarea" /></Card>}</div></div>
  </>
}
