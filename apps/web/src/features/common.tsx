import Link from 'next/link'
import { Badge, Button, Empty, ErrorState, Loading } from '../shared/ui'
import type { ReactNode } from 'react'
import type { Run, Metrics } from '../core/types'
import styles from './workspace.module.scss'
export const date = (value: string) => new Date(value).toLocaleString('es-PY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
export const duration = (ms: number | null | undefined) => ms == null ? '—' : ms < 60_000 ? `${Math.round(ms / 1000)} s` : `${Math.floor(ms / 60_000)} min ${Math.round(ms % 60_000 / 1000)} s`
export const statusLabels: Record<Run['status'], string> = { opened: 'En preparación', waiting_approval: 'Por aprobar', writing: 'Guardando', created: 'Por verificar', succeeded: 'Verificado', rejected: 'Rechazado', uncertain: 'Por revisar' }
export function Status({ run }: { run: Run }) { return <Badge tone={run.status === 'succeeded' ? 'green' : ['uncertain', 'waiting_approval', 'created', 'writing'].includes(run.status) ? 'amber' : 'neutral'}>{statusLabels[run.status]}</Badge> }
export function Heading({ title, description, action }: { title: string; description?: string; action?: ReactNode }) { return <div className={styles.heading}><div><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div> }
export function Resource<T>({ resource, children }: { resource: { data?: T; loading: boolean; error?: string; retry: () => void }; children: (data: T) => ReactNode }) {
  if (resource.error) return <ErrorState message={resource.error} retry={resource.retry} />
  if (resource.data === undefined) return <Loading />
  return <div aria-busy={resource.loading}>{children(resource.data)}</div>
}
export function Pagination({ offset, total, hasMore, change }: { offset: number; total: number; hasMore: boolean; change: (offset: number) => void }) {
  if (total <= 20) return null
  return <div className={styles.pagination}><span>{offset + 1}–{Math.min(offset + 20, total)} de {total}</span><div className={styles.actions}><Button secondary disabled={!offset} onClick={() => change(Math.max(0, offset - 20))}>Anterior</Button><Button secondary disabled={!hasMore} onClick={() => change(offset + 20)}>Siguiente</Button></div></div>
}
export function RunList({ runs }: { runs: Run[] }) {
  if (!runs.length) return <Empty title="Sin traspasos" />
  return <div className={styles.list}>{runs.map(run => <Link className={styles.row} key={run.id} href={`/runs/${run.id}`}><div><h3>{run.task.title}</h3><p>{run.mode === 'assisted' ? 'Asistido' : 'Manual'} · {date(run.openedAt)}</p></div><div className={styles.rowAside}><Status run={run} /><span className={styles.arrow} aria-hidden="true">↗</span></div></Link>)}</div>
}
export function Stats({ metrics }: { metrics: Metrics }) {
  return <div className={styles.stats}>{[
    ['Verificados', String(metrics.manualCompleted + metrics.assistedCompleted)],
    ['Asistidos', String(metrics.assistedCompleted)],
    ['Ahorro estimado', duration(metrics.estimatedSavedMs)],
    ['Pendientes', String(metrics.activeRuns)],
  ].map(([title, value]) => <div className={styles.stat} key={title}><span>{title}</span><strong>{value}</strong></div>)}</div>
}
