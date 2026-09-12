import { z } from 'zod'
import { DomainError } from '../errors/index.js'
import type { Draft, Workspace } from '../models/index.js'

const taskSchema = z.object({
  id: z.string().uuid(), title: z.string(), description: z.string().nullable().default(null),
  status: z.string(), priority: z.string(), due_date: z.string().nullable().optional(),
})
const documentSchema = z.object({ id: z.string().uuid(), title: z.string(), content: z.string().nullable() })

export class AmbiguousWorkspace implements Workspace {
  constructor(private key: string, private base = 'https://app.ambiguous.ai/api') {
    if (base !== 'https://app.ambiguous.ai/api') throw new Error('Ambiguous debe usar su origen oficial HTTPS.')
  }
  private async request(path: string, body?: unknown): Promise<unknown> {
    if (!this.key || this.key === 'ak_xxx') throw new DomainError('NOT_CONFIGURED', 'Configurá AMBIGUOUS_API_KEY en .env.')
    let response: Response
    try {
      response = await fetch(this.base + path, {
        method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(30_000),
        headers: { Authorization: `Bearer ${this.key}`, 'Content-Type': 'application/json', 'API-Version': '1' },
        ...(body ? { body: JSON.stringify(body) } : {}),
      })
    } catch {
      throw new DomainError('PROVIDER_UNAVAILABLE', 'Ambiguous no respondió. Si estabas guardando, verificá Docs antes de repetir.')
    }
    if (!response.ok) throw new DomainError('PROVIDER_ERROR', `Ambiguous respondió ${response.status}. Revisá acceso y estado del servicio.`)
    try { return await response.json() } catch { throw new DomainError('PROVIDER_ERROR', 'Ambiguous devolvió una respuesta inválida.') }
  }
  async identity() {
    return z.object({ id: z.string(), display_name: z.string(), workspace_id: z.string(), type: z.string() })
      .parse(await this.request('/users/me'))
  }
  async tasks(cursor?: string) {
    // Ambiguous puede devolver has_more sin next_cursor. Usamos su paginacion
    // offset documentada; el cursor local es ese desplazamiento, no uno inventado del proveedor.
    const offset = cursor === undefined ? 0 : Number(z.string().regex(/^\d{1,7}$/).parse(cursor))
    const query = new URLSearchParams({ limit: '20', offset: String(offset) })
    const result = z.object({ data: z.array(taskSchema), has_more: z.boolean(), next_cursor: z.string().optional() })
      .parse(await this.request(`/tasks?${query}`))
    return { data: result.data, meta: { hasMore: result.has_more, nextCursor: result.has_more ? String(offset + 20) : null } }
  }
  async task(id: string) { return z.object({ task: taskSchema }).parse(await this.request(`/tasks/${encodeURIComponent(id)}`)).task }
  async createDocument(draft: Draft) {
    return documentSchema.parse(await this.request('/documents', { type: 'doc', ...draft, visibility: 'restricted' }))
  }
  async document(id: string) { return documentSchema.parse(await this.request(`/documents/${encodeURIComponent(id)}`)) }
}
