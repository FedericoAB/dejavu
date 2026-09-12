void chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' })
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || sender.url?.split('?')[0] !== chrome.runtime.getURL('panel.html')) return false
  if (message.type !== 'api') return false
  const path = String(message.path ?? '')
  if (!/^\/v1\/(workspace|tasks(?:\?cursor=[^#]*)?|state(?:\?offset=\d+)?|observation|runs(?:\/[a-f0-9-]+(?:\/(prepare|dismiss|reject|approve|verify))?)?)$/.test(path)) {
    sendResponse({ error: 'Ruta no permitida.' }); return false
  }
  void (async () => {
    try {
      const { coreToken } = await chrome.storage.local.get('coreToken')
      if (!coreToken) throw new Error('Configurá el token local para conectar.')
      const response = await fetch(`http://127.0.0.1:8080${path}`, {
        method: message.body === undefined ? 'GET' : 'POST', redirect: 'error',
        headers: { Authorization: `Bearer ${coreToken}`, 'Content-Type': 'application/json' },
        ...(message.body === undefined ? {} : { body: JSON.stringify(message.body) }),
        signal: AbortSignal.timeout(65_000),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error?.message ?? 'La solicitud falló.')
      sendResponse({ data: body })
    } catch (error) { sendResponse({ error: error instanceof Error ? error.message : 'No se pudo conectar al core.' }) }
  })()
  return true
})
