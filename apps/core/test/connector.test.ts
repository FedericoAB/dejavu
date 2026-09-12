import { afterEach, expect, it, vi } from 'vitest'
import { AmbiguousWorkspace } from '../src/connectors/ambiguous.js'
afterEach(() => vi.unstubAllGlobals())

it('pagina aunque Ambiguous devuelva has_more sin next_cursor', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [], has_more: true })))
  vi.stubGlobal('fetch', fetch)
  const result = await new AmbiguousWorkspace('test').tasks('20')
  expect(fetch.mock.calls[0][0]).toContain('limit=20&offset=20')
  expect(result.meta).toEqual({ hasMore: true, nextCursor: '40' })
})

it('crea docs con visibilidad restricted y valida el ID del proveedor', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
    id: '7b0a486d-7c0f-4b38-a16a-68d5b118cf40', title: 'Traspaso', content: 'Contexto',
  })))
  vi.stubGlobal('fetch', fetch)
  await new AmbiguousWorkspace('test').createDocument({ title: 'Traspaso', content: 'Contexto' })
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ type: 'doc', title: 'Traspaso', content: 'Contexto', visibility: 'restricted' })
})
