'use client'
import { useResource } from '../core/session'
import type { Metrics as MetricsType } from '../core/types'
import { Card, Empty } from '../shared/ui'
import { Heading, Resource, Stats, duration } from './common'
import styles from './workspace.module.scss'
export function Metrics() {
  const metrics = useResource<MetricsType>('/metrics')
  return <><Heading title="Métricas" /><Resource resource={metrics}>{data => <><Stats metrics={data} />{data.manualCompleted + data.assistedCompleted === 0 && <Card><Empty title="Sin resultados" /></Card>}<div className={styles.columns} style={{ marginTop: 24 }}><Card><h2>Actividad</h2>{[['Ofertas realizadas', data.offered], ['Guardados aprobados', data.approved], ['Traspasos rechazados', data.rejected], ['Ofertas silenciadas', data.dismissed]].map(([label, value]) => <div className={styles.row} key={label}><span>{label}</span><strong>{value}</strong></div>)}</Card><Card><h2>Modalidad</h2><div className={styles.comparison}><span>Manuales</span><strong>{data.manualCompleted}</strong></div><div className={styles.meter}><span style={{ width: `${data.manualCompleted / Math.max(1, data.manualCompleted + data.assistedCompleted) * 100}%` }} /></div><div className={styles.comparison}><span>Asistidos</span><strong>{data.assistedCompleted}</strong></div><div className={styles.meter}><span style={{ width: `${data.assistedCompleted / Math.max(1, data.manualCompleted + data.assistedCompleted) * 100}%` }} /></div><p className={styles.note}>Mediana manual: {duration(data.medianManualDurationMs)}<br />Eventos de observación conservados: {data.observedEvents}</p></Card></div><details className={styles.method}><summary>Cómo se calcula</summary><p>El ahorro compara la duración asistida con la mediana manual de cada oferta, incluyendo revisión y espera. — indica evidencia insuficiente. El historial puede incluir ensayos.</p></details></>}</Resource></>
}
