import { expect, it, vi } from 'vitest'
vi.mock('../src/hash.js', () => ({ fnv1a: () => 'same-hash' }))
import { minePatterns } from '../src/mine.js'
import type { NormalizedEvent } from '../src/types.js'

it('dos secuencias distintas no se cuentan como repetidas aunque colisione el hash', () => {
  const events: NormalizedEvent[] = ['a', 'b', 'c', 'x', 'y', 'z'].map((stepKey, i) => ({
    stepKey, kind: i % 3 === 2 ? 'doc.create' : 'click', app: 'test', source: 'app',
    occurredAt: new Date(1_800_000_000_000 + i * 10000).toISOString(), locator: {},
  }))
  expect(minePatterns(events)).toEqual([])
})
