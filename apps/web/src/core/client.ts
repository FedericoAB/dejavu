export const API_URL = process.env.NEXT_PUBLIC_CORE_API_URL || 'http://127.0.0.1:8080'

export class ApiError extends Error {
  constructor(message: string, readonly code: string, readonly requestId?: string) { super(message) }
}

export async function request<T>(token: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_URL}/v1${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      cache: 'no-store', redirect: 'error', signal: signal ?? AbortSignal.timeout(65_000),
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch (error) {
    if (signal?.aborted) throw error
    throw new ApiError('No pudimos conectar con Déjà Vu. Comprobá que el core esté encendido y reintentá la lectura.', 'OFFLINE')
  }
  const value = await response.json()
  if (!response.ok) throw new ApiError(value.error?.message ?? 'La operación no pudo completarse.', value.error?.code ?? 'ERROR', value.error?.requestId)
  return value as T
}

// fetch permite enviar el bearer sin exponerlo en la URL del stream.
export async function stream(token: string, path: string, signal: AbortSignal, onEvent: (event: string, data: unknown) => void) {
  const response = await fetch(`${API_URL}/v1${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' }, signal, cache: 'no-store', redirect: 'error',
  })
  if (!response.ok || !response.body) throw new Error('Se interrumpió la conexión en vivo.')
  const reader = response.body.getReader(), decoder = new TextDecoder()
  let buffer = ''
  try {
    while (!signal.aborted) {
      const { value, done } = await reader.read()
      if (done) throw new Error('Se cerró la conexión en vivo.')
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n')
      let end: number
      while ((end = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, end); buffer = buffer.slice(end + 2)
        const lines = block.split('\n')
        const event = lines.find(line => line.startsWith('event:'))?.slice(6).trim() ?? 'message'
        const data = lines.filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n')
        if (data) onEvent(event, JSON.parse(data))
      }
    }
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock() }
}
