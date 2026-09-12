import { build } from 'esbuild'
import { mkdir, cp } from 'node:fs/promises'
await mkdir('dist', { recursive: true })
await cp('static', 'dist', { recursive: true })
await build({ entryPoints: ['src/background.ts', 'src/panel.ts', 'src/content.ts'], bundle: true, outdir: 'dist', target: 'chrome120' })
