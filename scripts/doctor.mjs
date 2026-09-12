import { preflight } from './runtime.mjs'

try {
  const config = await preflight({ production: process.argv.includes('--production') })
  console.log('Configuración lista: Node compatible, claves presentes, dependencias y puertos disponibles.')
  console.log(`Frontend: ${config.webUrl}. Core: ${config.coreUrl}.`)
  console.log('No se contactó Ambiguous ni se crearon/importaron tareas, documentos o historial.')
} catch (error) {
  console.error(`Preflight: ${error.message}`)
  process.exitCode = 1
}
