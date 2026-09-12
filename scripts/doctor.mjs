import { preflight } from './runtime.mjs'

try {
  const config = await preflight({ production: process.argv.includes('--production') })
  console.log('Arranque local listo: Node compatible, token local presente, dependencias y puertos disponibles.')
  console.log(`Frontend: ${config.webUrl}. Core: ${config.coreUrl}.`)
  console.log(config.providerKeyPresent
    ? 'Ambiguous: credencial presente en el entorno; su conexión se comprueba desde Configuración.'
    : 'Ambiguous: conexión pendiente de comprobar en Configuración. Podés levantar la aplicación y guardar la clave desde esa pantalla.')
  console.log('No se contactó Ambiguous ni se crearon/importaron tareas, documentos o historial.')
} catch (error) {
  console.error(`Preflight: ${error.message}`)
  process.exitCode = 1
}
