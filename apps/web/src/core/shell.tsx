'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { request } from './client'
import { SessionProvider, useSession } from './session'
import type { Workspace } from './types'
import { Button, Card, ErrorState, Input, Loading } from '../shared/ui'
import styles from './shell.module.scss'

type Identity = Awaited<ReturnType<Workspace['identity']>>
const navigation = [{ href: '/', icon: '◫', label: 'Inicio' }, { href: '/routines', icon: '↻', label: 'Rutinas' }, { href: '/runs', icon: '≡', label: 'Historial' }, { href: '/metrics', icon: '▥', label: 'Métricas' }]

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [session, setSession] = useState<{ token: string; identity: Identity }>()
  const [checking, setChecking] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [input, setInput] = useState('')
  useEffect(() => {
    const token = sessionStorage.getItem('dejavu.token')
    if (!token) { setChecking(false); return }
    request<Identity>(token, '/workspace').then(identity => setSession({ token, identity }))
      .catch(error => setError(error.message)).finally(() => setChecking(false))
  }, [])
  async function connect(event: FormEvent) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError('')
    try {
      const token = input.trim()
      if (token.length < 24) throw new Error('El token local debe tener al menos 24 caracteres.')
      const identity = await request<Identity>(token, '/workspace')
      sessionStorage.setItem('dejavu.token', token); setSession({ token, identity }); setInput('')
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo conectar.') }
    finally { setBusy(false) }
  }
  const disconnect = () => { sessionStorage.removeItem('dejavu.token'); setSession(undefined); setError('') }
  return <div className={styles.shell}>
    <a className={styles.skip} href="#main">Ir al contenido</a>
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand}><span className={styles.mark} aria-hidden="true">↻</span><span>Déjà Vu<small>MENOS REPETICIÓN</small></span></Link>
      <nav aria-label="Navegación principal">{navigation.map(item => <Link key={item.href} href={item.href} aria-current={(item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)) ? 'page' : undefined}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</nav>
      <div className={styles.sidebarNote}><span className={styles.orbit} aria-hidden="true">↗</span><p>El próximo traspaso<br />puede hacerse solo.</p><small>Vos revisás. Vos decidís.</small></div>
      <a className={styles.workspaceLink} href="https://app.ambiguous.ai/" target="_blank" rel="noreferrer">Abrir Ambiguous <span aria-hidden="true">↗</span></a>
      <div className={styles.footer}>MVP · Traspasos de tareas</div>
    </aside>
    <div className={styles.body}>
      {session ? <SessionProvider {...session} disconnect={disconnect}><Topbar /><main id="main" className={styles.main}>{children}</main></SessionProvider> : <>
        <header className={styles.topbar}><span>Tu espacio de trabajo</span><span className={styles.offline}>Sin conectar</span></header>
        <main id="main" className={styles.main}>{checking ? <Loading /> : <div className={styles.connect}>
          <div className={styles.connectIntro}><p className={styles.eyebrow}>TU TRABAJO, CON MENOS REPETICIÓN</p><h1>Una vez más.<br />Con un poco de ayuda.</h1><p>Déjà Vu reconoce cómo preparás tus traspasos y ofrece hacer el siguiente. Sin escribir un prompt.</p></div>
          <Card><h2>Conectá tu workspace</h2><p>Usá el token del core local para ver tus tareas, revisar documentos y seguir cada traspaso.</p>{error && <ErrorState message={error} />}<form onSubmit={connect}><Input label="Token del core local" type="password" autoComplete="off" value={input} onChange={e => setInput(e.target.value)} required minLength={24} placeholder="CORE_INGEST_TOKEN" disabled={busy} /><Button type="submit" disabled={busy}>{busy ? 'Conectando…' : 'Conectar workspace →'}</Button></form><p className={styles.help}>Lo encontrás como <code>CORE_INGEST_TOKEN</code> en el archivo <code>.env</code>. La sesión dura hasta cerrar esta pestaña.</p></Card>
          <div className={styles.connectionSteps}><span><b>01</b> Trabajá como siempre</span><span><b>02</b> Reconocé la repetición</span><span><b>03</b> Revisá y aprobá</span></div>
        </div>}</main>
      </>}
    </div>
  </div>
}
function Topbar() {
  const { identity, live, disconnect } = useSession()
  return <header className={styles.topbar}><div><span className={live ? styles.dot : styles.pendingDot} /><span>{live ? 'Conectado en vivo' : 'Reconectando seguimiento…'}</span></div><div><span className={styles.identity}>{identity.display_name}</span><Button secondary onClick={disconnect}>Desconectar</Button></div></header>
}
