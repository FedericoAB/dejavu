void chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.url?.split('?')[0] !== chrome.runtime.getURL('panel.html')) return false
  if (!message || message.type !== 'api') return false
  const path = String(message.path ?? '')
  if (!/^\/v1\/(workspace|tasks(?:\?cursor=\d{1,7})?|state(?:\?offset=\d+)?|observation|runs(?:\/[a-f0-9-]+(?:\/(prepare|dismiss|reject|approve|verify))?)?)$/.test(path)) {
    sendResponse({ error: 'Ruta no permitida.' }); return false
  }
  void (async () => {
    try {
      const { coreToken } = await chrome.storage.local.get('coreToken')
      if (!coreToken) { sendResponse({ error: 'Configurá el token local para conectar.', code: 'UNAUTHORIZED' }); return }
      const response = await fetch(`http://127.0.0.1:8080${path}`, {
        method: message.body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${coreToken}`, 'Content-Type': 'application/json' },
        ...(message.body === undefined ? {} : { body: JSON.stringify(message.body) }),
        signal: AbortSignal.timeout(25_000),
      })
      const body = await response.json()
      if (!response.ok) { sendResponse({ error: body.error?.message ?? 'La solicitud falló.', code: body.error?.code }); return }
      sendResponse({ data: body })
    } catch (error) {
      const timeout = error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)
      sendResponse({ error: timeout ? 'El core tardó demasiado en responder. Consultá el estado antes de repetir una acción.' : 'No se pudo conectar al core local. Verificá que pnpm dev siga ejecutándose.', code: timeout ? 'TIMEOUT' : 'DISCONNECTED' })
    }
  })()
  return true
})
