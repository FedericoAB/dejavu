import { serve } from './serve.mjs'

try { await serve(true) } catch (error) {
  console.error(`No se pudo iniciar Déjà Vu: ${error.message}`)
  process.exitCode = 1
}
