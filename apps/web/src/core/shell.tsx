'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { API_URL, normalizeApiUrl, request } from './client'
import { SessionProvider, useSession } from './session'
import type { Workspace } from './types'
import type { SettingsState } from '../../../core/src/models/index'
import { Button, Card, ErrorState, Input, Loading } from '../shared/ui'
import styles from './shell.module.scss'

type Identity = Awaited<ReturnType<Workspace['identity']>>
const navigation = [{ href: '/', icon: '◫', label: 'Traspasos' }, { href: '/routines', icon: '↻', label: 'Rutinas' }, { href: '/runs', icon: '≡', label: 'Historial' }, { href: '/metrics', icon: '▥', label: 'Métricas' }]

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname(), router = useRouter()
  const [session, setSession] = useState<{ token: string; identity: Identity | null }>()
  const [checking, setChecking] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [input, setInput] = useState(''), [url, setUrl] = useState(API_URL)
  useEffect(() => {
    const token = sessionStorage.getItem('dejavu.token')
    setUrl(sessionStorage.getItem('dejavu.apiUrl') || API_URL)
    if (!token) { setChecking(false); return }
    request<SettingsState>(token, '/settings').then(settings => setSession({ token, identity: settings.ambiguous.identity }))
      .catch(error => setError(error.message)).finally(() => setChecking(false))
  }, [])
  useEffect(() => {
    if (!checking && (!session || !session.identity) && pathname !== '/settings') router.replace('/settings')
  }, [checking, session, pathname, router])
  async function connect(event: FormEvent) {
    event.preventDefault(); if (busy) return
    setBusy(true); setError('')
    try {
      const token = input.trim(), base = normalizeApiUrl(url)
      if (token.length < 24) throw new Error('Usá un token de al menos 24 caracteres.')
      const settings = await request<SettingsState>(token, '/settings', undefined, undefined, base)
      sessionStorage.setItem('dejavu.apiUrl', base)
      sessionStorage.setItem('dejavu.token', token)
      setSession({ token, identity: settings.ambiguous.identity }); setInput('')
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo conectar.') }
    finally { setBusy(false) }
  }
  const disconnect = () => { sessionStorage.removeItem('dejavu.token'); setSession(undefined); setError(''); router.replace('/settings') }
  const updateSession = (token: string, identity: Identity | null) => { sessionStorage.setItem('dejavu.token', token); setSession({ token, identity }) }
  const current = (href: string) => href === '/' ? pathname === '/' || pathname.startsWith('/runs/') : href === '/runs' ? pathname === '/runs' : pathname.startsWith(href)
  return <div className={styles.shell}>
    <a className={styles.skip} href="#main">Ir al contenido</a>
    <aside className={styles.sidebar}>
      <Link href="/" className={styles.brand}><span className={styles.mark} aria-hidden="true">↻</span>Déjà Vu</Link>
      <nav aria-label="Navegación principal">{navigation.map(item => <Link key={item.href} href={item.href} aria-current={current(item.href) ? 'page' : undefined}><span aria-hidden="true">{item.icon}</span>{item.label}</Link>)}</nav>
      <div className={styles.sidebarBottom}><Link className={styles.settingsLink} href="/settings" aria-current={pathname === '/settings' ? 'page' : undefined}><span aria-hidden="true">⚙</span>Configuración</Link><a className={styles.workspaceLink} href="https://app.ambiguous.ai/" target="_blank" rel="noreferrer">Ambiguous <span aria-hidden="true">↗</span></a></div>
    </aside>
    <div className={styles.body}>
      {session ? <SessionProvider {...session} disconnect={disconnect} updateSession={updateSession}><Topbar /><main id="main" className={styles.main}>{children}</main></SessionProvider> : <>
        <header className={styles.topbar}><span>Configuración</span><span>Sin conexión</span></header>
        <main id="main" className={styles.main}>{checking ? <Loading /> : <div className={styles.connect}>
          <h1>Conexiones</h1><Card><h2>Core local</h2>{error && <ErrorState message={error} />}<form onSubmit={connect}><Input label="Token del core" type="password" autoComplete="off" value={input} onChange={e => setInput(e.target.value)} required minLength={24} placeholder="CORE_INGEST_TOKEN" disabled={busy} /><details className={styles.advanced}><summary>URL de conexión</summary><Input label="URL del core" type="url" value={url} onChange={e => setUrl(e.target.value)} required disabled={busy} /></details><Button type="submit" disabled={busy}>{busy ? 'Conectando…' : 'Conectar'}</Button></form><p className={styles.help}>Token local: <code>CORE_INGEST_TOKEN</code> en <code>.env</code>.</p></Card></div>}</main>
      </>}
    </div>
  </div>
}
function Topbar() {
  const { identity, live } = useSession(), pathname = usePathname()
  const label = pathname.startsWith('/settings') ? 'Configuración' : pathname.startsWith('/metrics') ? 'Métricas' : pathname.startsWith('/routines') ? 'Rutinas' : pathname === '/runs' ? 'Historial' : 'Workspace'
  return <header className={styles.topbar}><span>{label}</span><div><span className={live ? styles.dot : styles.pendingDot} /><span>{live ? 'En línea' : 'Conectando…'}</span><span className={styles.identity}>{identity?.display_name || 'Sin workspace'}</span></div></header>
}
