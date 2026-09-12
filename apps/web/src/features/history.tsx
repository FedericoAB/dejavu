'use client'
import Link from 'next/link'
import { useState } from 'react'
import { useResource } from '../core/session'
import type { Page, Run } from '../core/types'
import { Card, Empty } from '../shared/ui'
import { Heading, Pagination, Resource, Status, date } from './common'
import styles from './workspace.module.scss'
export function History() {
  const [offset, setOffset] = useState(0), runs = useResource<Page<Run>>(`/runs?offset=${offset}&limit=20`)
  return <><Heading title="Cada traspaso, a la vista." description="Revisá qué se aprobó, qué se guardó y qué queda por resolver." /><Card><Resource resource={runs}>{page => <>{!page.data.length ? <Empty title="Todavía no hay traspasos">El historial se completa con tus acciones reales.</Empty> : <div className={styles.tableWrap}><table className={styles.table}><thead><tr><th scope="col">Tarea</th><th scope="col">Modalidad</th><th scope="col">Estado</th><th scope="col">Inicio</th></tr></thead><tbody>{page.data.map(run => <tr key={run.id}><td><Link href={`/runs/${run.id}`}>{run.task.title} ↗</Link></td><td>{run.mode === 'assisted' ? 'Asistido' : 'Manual'}</td><td><Status run={run} /></td><td>{date(run.openedAt)}</td></tr>)}</tbody></table></div>}<Pagination {...page.meta} change={setOffset} /></>}</Resource></Card></>
}
