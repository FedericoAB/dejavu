'use client'
import { useRef, useState, type FormEvent } from 'react'
import type { SettingsState, SettingsUpdateResult } from '../../../core/src/models/index'
import { ApiError, currentApiUrl, normalizeApiUrl, request } from '../core/client'
import { useResource, useSession } from '../core/session'
import { Badge, Button, Card, ErrorState, Input } from '../shared/ui'
import { SecretInput } from '../shared/secret-input'
import { Heading, Resource } from './common'
import styles from './workspace.module.scss'

export function Settings() {
  const { token, updateSession, refresh, disconnect } = useSession()
  const settings = useResource<SettingsState>('/settings')
  const [key, setKey] = useState(''), [nextToken, setNextToken] = useState('')
  const [url, setUrl] = useState(currentApiUrl), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [recoveryToken, setRecoveryToken] = useState<string | undefined>()
  const lock = useRef(false)
  const changed = Boolean(key.trim() || nextToken.trim())
  async function save(event: FormEvent) {
    event.preventDefault(); if (lock.current || !changed || recoveryToken !== undefined) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    const candidateToken = nextToken.trim() || token
    try {
      const result = await request<SettingsUpdateResult>(token, '/settings', { ...(key.trim() ? { ambiguousApiKey: key.trim() } : {}), ...(nextToken.trim() ? { coreToken: nextToken.trim() } : {}) })
      updateSession(candidateToken, result.settings.ambiguous.identity)
      setKey(''); setNextToken(''); refresh(); settings.retry()
      setNotice(result.tokenChanged ? 'Guardado. Actualizá el token de la extensión.' : 'Cambios guardados.')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'No se pudo guardar.')
      if (error instanceof ApiError && error.code === 'OFFLINE') setRecoveryToken(candidateToken)
    } finally { lock.current = false; setBusy(false) }
  }
  async function recover() {
    if (lock.current || recoveryToken === undefined) return
    lock.current = true; setBusy(true)
    try {
      let activeToken = recoveryToken, state: SettingsState
      try { state = await request<SettingsState>(activeToken, '/settings') }
      catch { activeToken = token; state = await request<SettingsState>(token, '/settings') }
      updateSession(activeToken, state.ambiguous.identity); setRecoveryToken(undefined); setKey(''); setNextToken(''); setError(''); refresh(); settings.retry(); setNotice('Conexión recuperada.')
    } catch { setError('No se pudo recuperar la conexión. Reintentá cuando el core esté disponible.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function changeUrl(event: FormEvent) {
    event.preventDefault(); if (lock.current || recoveryToken !== undefined) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const base = normalizeApiUrl(url)
      const state = await request<SettingsState>(token, '/settings', undefined, undefined, base)
      sessionStorage.setItem('dejavu.apiUrl', base)
      updateSession(token, state.ambiguous.identity)
      window.location.reload()
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo conectar.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function reconnect() {
    if (lock.current || recoveryToken !== undefined) return
    lock.current = true; setBusy(true); setError(''); setNotice('')
    try {
      const state = await request<SettingsState>(token, '/settings/check', {})
      updateSession(token, state.ambiguous.identity); refresh(); settings.retry(); setNotice('Conexión verificada.')
    } catch (error) { setError(error instanceof Error ? error.message : 'No se pudo conectar.') }
    finally { lock.current = false; setBusy(false) }
  }
  async function copyToken() {
    try { await navigator.clipboard.writeText(token); setNotice('Token copiado.'); setError('') }
    catch { setError('No se pudo copiar el token al portapapeles.') }
  }
  function generateToken() { setNextToken(Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, '0')).join('')) }
  return <><Heading title="Configuración" action={<Button secondary onClick={disconnect} disabled={busy}>Desconectar</Button>} />
    {recoveryToken !== undefined ? <ErrorState message={error || 'Recuperá la conexión antes de continuar.'} retry={() => void recover()} /> : error && <ErrorState message={error} />}{notice && <p role="status" className={styles.saved}>{notice}</p>}
    <Resource resource={settings}>{state => <><form onSubmit={save}><div className={styles.settingsGrid}>
      <Card><div className={styles.sectionTitle}><div className={styles.connectionTitle}><span className={styles.serviceIcon}>A</span><h2>Ambiguous</h2></div><Badge tone={state.ambiguous.connected ? 'green' : 'amber'}>{state.ambiguous.connected ? 'Conectado' : 'Pendiente'}</Badge></div>
        {state.ambiguous.identity && <p className={styles.connectionIdentity}>{state.ambiguous.identity.display_name}</p>}
        {state.ambiguous.error && <ErrorState message={state.ambiguous.error} />}
        <SecretInput label="API key de Ambiguous" value={key} onChange={setKey} disabled={busy || recoveryToken !== undefined} placeholder={state.ambiguous.configured ? 'Clave guardada · reemplazar' : 'ak_…'} minLength={11} maxLength={512} />
        {state.ambiguous.configured && !state.ambiguous.connected && <Button type="button" secondary disabled={busy || recoveryToken !== undefined} onClick={() => void reconnect()}>Reintentar conexión</Button>}
        <p className={styles.fieldHint}>{state.ambiguous.configured ? 'Dejá vacío para conservar la clave.' : 'Se valida al guardar.'}</p>
      </Card>
      <Card><div className={styles.sectionTitle}><div className={styles.connectionTitle}><span className={styles.serviceIcon}>↻</span><h2>Core local</h2></div><Badge tone="green">Conectado</Badge></div>
        <div className={styles.tokenActions}><span className={styles.masked}>•••• •••• •••• ••••</span><Button type="button" secondary disabled={busy || recoveryToken !== undefined} onClick={() => void copyToken()}>Copiar token actual</Button></div>
        <SecretInput label="Nuevo token del core" value={nextToken} onChange={setNextToken} disabled={busy || recoveryToken !== undefined} placeholder="Sin cambios" minLength={24} maxLength={256} />
        <div className={styles.fieldActions}><span className={styles.fieldHint}>Mínimo 24 caracteres.</span><Button secondary type="button" disabled={busy || recoveryToken !== undefined} onClick={generateToken}>Generar token</Button></div>
      </Card>
    </div><div className={styles.settingsSave}><span className={styles.fieldHint}>Claves guardadas solo en el servidor local.</span><Button type="submit" disabled={busy || !changed || recoveryToken !== undefined}>{busy ? 'Guardando…' : 'Guardar cambios'}</Button></div></form>
    <details className={styles.advancedSettings}><summary>Conexión avanzada</summary><form onSubmit={changeUrl}><Input label="URL del core" type="url" value={url} onChange={event => setUrl(event.target.value)} disabled={busy || recoveryToken !== undefined} required /><Button type="submit" secondary disabled={busy || recoveryToken !== undefined || url === currentApiUrl()}>Cambiar conexión</Button></form></details></>}</Resource>
  </>
}
