import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
const path = new URL('../.env', import.meta.url)
let content = readFileSync(existsSync(path) ? path : new URL('../.env.example', import.meta.url), 'utf8')
if (!/^CORE_INGEST_TOKEN=.{24,}$/m.test(content)) {
  content = content.replace(/^CORE_INGEST_TOKEN=.*\n?/m, '')
  content += `\nCORE_INGEST_TOKEN=${randomBytes(32).toString('hex')}\n`
}
writeFileSync(path, content, { mode: 0o600 })
console.log('.env preparado. Completá AMBIGUOUS_API_KEY y usá CORE_INGEST_TOKEN para conectar la extensión.')
