'use client'
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { request, stream } from './client'
import type { Workspace } from './types'

type Identity = Awaited<ReturnType<Workspace['identity']>>
type Session = { token: string; identity: Identity | null; version: number; live: boolean; refresh: () => void; disconnect: () => void; updateSession: (token: string, identity: Identity | null) => void }
export const SessionContext = createContext<Session | null>(null)
export function useSession() { const value = useContext(SessionContext); if (!value) throw new Error('Conectá el workspace primero.'); return value }
export function SessionProvider({ token, identity, disconnect, updateSession, children }: { token: string; identity: Identity | null; disconnect: () => void; updateSession: (token: string, identity: Identity | null) => void; children: ReactNode }) {
  const [version, setVersion] = useState(0), [live, setLive] = useState(false)
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Una escritura publica varias revisiones; agruparlas evita lecturas duplicadas.
  const refresh = useCallback(() => {
    clearTimeout(refreshTimer.current)
    refreshTimer.current = setTimeout(() => setVersion(value => value + 1), 150)
  }, [])
  useEffect(() => () => clearTimeout(refreshTimer.current), [])
  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout> | undefined
    const connect = () => {
      stream(token, '/stream', controller.signal, () => { setLive(true); refresh() }).catch(() => {
        if (!controller.signal.aborted) { setLive(false); timer = setTimeout(connect, 4000) }
      })
    }
    connect()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [token, refresh])
  return <SessionContext.Provider value={{ token, identity, version, live, refresh, disconnect, updateSession }}>{children}</SessionContext.Provider>
}

export function useResource<T>(path: string, followChanges = true) {
  const { token, version } = useSession()
  const refreshVersion = followChanges ? version : 0
  const [state, setState] = useState<{ data?: T; error?: string; loading: boolean }>({ loading: true })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setState(current => ({ ...current, error: undefined, loading: true }))
    request<T>(token, path, undefined, controller.signal)
      .then(data => { if (!controller.signal.aborted) setState({ data, loading: false }) })
      .catch(error => { if (!controller.signal.aborted) setState({ error: error.message, loading: false }) })
    return () => controller.abort()
  }, [token, path, refreshVersion, attempt])
  return { ...state, retry: () => setAttempt(value => value + 1) }
}
