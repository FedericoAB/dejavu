'use client'
import Link from 'next/link'
import { useResource } from '../core/session'
import type { Page, Pattern, Routine } from '../core/types'
import { Badge, Card, Empty } from '../shared/ui'
import { Heading, Resource, duration, date } from './common'
import styles from './workspace.module.scss'
export function Routines({ id }: { id?: string }) {
  const list = useResource<Page<Routine>>('/routines')
  const detail = useResource<Routine>(`/routines/${encodeURIComponent(id ?? 'task-handoff')}`)
  const patterns = useResource<Page<Pattern>>('/patterns')
  return <>{id && <Link className={styles.back} href="/routines">← Todas las rutinas</Link>}<Heading title={id ? 'Del contexto al traspaso.' : 'Lo que podés dejar en nuestras manos.'} description="Una receta de traspaso, con revisión antes de cada escritura." />
    {id ? <div className={styles.columns}><Card><Resource resource={detail}>{routine => <><Badge tone="green">Plantilla fija · disponible</Badge><h2 style={{ marginTop: 20 }}>{routine.name}</h2><p className={styles.subtle}>{routine.description}</p><ol className={styles.steps}>{routine.steps.map(step => <li key={step.id}>{step.title}</li>)}</ol><p>Referencia manual observada: <strong>{duration(routine.estimatedManualMs)}</strong></p><p className={styles.note}>El título y el contexto cambian con la tarea que abras. El documento se prepara con esos datos; la receta no infiere compromisos ni avances.</p><div className={styles.actions}><Link href="/">Elegir una tarea →</Link></div></>}</Resource></Card><Card><h2>Evidencia del patrón</h2><Resource resource={patterns}>{page => !page.data.length ? <Empty title="Todavía no hay un patrón confirmado">Completá dos traspasos manuales para obtener una referencia.</Empty> : page.data.map(pattern => <div key={pattern.id}><p>{pattern.support} repeticiones · mediana {duration(pattern.medianDurationMs)}</p>{pattern.occurrences.map(item => <Link href={`/runs/${item.runId}`} className={styles.row} key={item.runId}><div><h3>Traspaso manual</h3><p>{date(item.startedAt)}</p></div><span>{duration(item.durationMs)} ↗</span></Link>)}</div>)}</Resource></Card></div> : <Card><Resource resource={list}>{page => page.data.length ? page.data.map(routine => <Link href={`/routines/${routine.id}`} className={styles.row} key={routine.id}><div><Badge tone="green">Revisión humana</Badge><h2 style={{ marginTop: 14 }}>{routine.name}</h2><p>{routine.description}</p></div><span className={styles.arrow} aria-hidden="true">↗</span></Link>) : <Empty title="No hay rutinas disponibles" />}</Resource></Card>}
  </>
}
