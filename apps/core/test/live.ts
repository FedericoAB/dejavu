import { loadEnvFile } from 'node:process'
// Ensayo explicito: crea hasta tres tareas DEMO y tres documentos privados reales.
// No envia mensajes, no asigna tareas y no cambia tareas existentes.
import { randomUUID } from 'node:crypto'
import { resolve } from 'node:path'
import { writeFileSync } from 'node:fs'
import { AmbiguousWorkspace } from '../src/connectors/ambiguous.js'
import { StateRepository } from '../src/repositories/state.js'
import { Workflow } from '../src/services/workflow.js'
import { createApp } from '../src/controllers/api.js'

if (!process.argv.includes('--write-demo')) throw new Error('Este ensayo escribe datos reales. Usá --write-demo para ejecutarlo.')
loadEnvFile(new URL('../../../.env', import.meta.url))
const workspace = new AmbiguousWorkspace(process.env.AMBIGUOUS_API_KEY ?? '')
const identity = await workspace.identity()
const dataDir = resolve('../../.local')
const statePath = resolve(dataDir, `state-${identity.workspace_id}-${identity.id}.json`)
const repository = new StateRepository(statePath)
if (repository.state.runs.length) throw new Error('Ya hay corridas. Conservamos el historial; continuá el ensayo desde el panel.')
const workflow = new Workflow(repository, workspace)
const token = process.env.CORE_INGEST_TOKEN!
const server = createApp(workflow, token).listen(0, '127.0.0.1')
await new Promise<void>(resolve => server.once('listening', resolve))
const address = server.address() as { port: number }
async function api(path: string, body?: unknown) {
  const response = await fetch(`http://127.0.0.1:${address.port}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
  if (!response.ok) throw new Error(`Core: ${response.status}`)
  return response.json()
}
try {
  const ids: string[] = []
  for (const [index, description] of [
    'Confirmar fecha de la reunión de arranque.',
    'Revisar el inventario antes de la entrega.',
    'Preparar los materiales de capacitación.',
  ].entries()) {
    const title = `DEMO Déjà Vu — traspaso ${index + 1}`
    const headers = { Authorization: `Bearer ${process.env.AMBIGUOUS_API_KEY}`, 'Content-Type': 'application/json' }
    const listResponse = await fetch(`https://app.ambiguous.ai/api/tasks?limit=20&q=${encodeURIComponent(title)}`, { headers })
    if (!listResponse.ok) throw new Error(`Ambiguous: ${listResponse.status}`)
    const list = await listResponse.json()
    let task = list.data.find((item: { title: string }) => item.title === title)
    if (!task) {
      const response = await fetch('https://app.ambiguous.ai/api/tasks', {
        method: 'POST', headers, body: JSON.stringify({ title, description, subscriber_ids: [] }), signal: AbortSignal.timeout(30_000),
      })
      if (!response.ok) throw new Error(`Crear tarea DEMO: ${response.status}`)
      task = (await response.json()).task
    }
    ids.push(task.id)
  }
  const rejected = await api('/v1/runs', { id: randomUUID(), taskId: ids[0] })
  await api(`/v1/runs/${rejected.id}/reject`, {})
  console.log('OK rechazo: no ejecutó creación de documento.')
  const evidence: { runId: string; documentId: string; mode: string }[] = []
  for (let i = 0; i < 3; i++) {
    const run = await api('/v1/runs', { id: randomUUID(), taskId: ids[i] })
    if (i < 2) {
      if (run.offer) throw new Error('Oferta prematura')
      await new Promise(resolve => setTimeout(resolve, 3000))
      await api(`/v1/runs/${run.id}/prepare`, { assisted: false, title: run.task.title, description: run.task.description ?? '' })
      await new Promise(resolve => setTimeout(resolve, 3000))
    } else {
      if (run.offer?.support !== 2) throw new Error('No apareció la tercera oferta')
      await api(`/v1/runs/${run.id}/prepare`, { assisted: true })
      console.log('OK tercera oferta: dos repeticiones verificadas, sin prompt.')
    }
    const result = await api(`/v1/runs/${run.id}/approve`, { approved: true })
    if (result.status !== 'succeeded') throw new Error(result.error ?? `Estado inesperado: ${result.status}`)
    const repeated = await api(`/v1/runs/${run.id}/approve`, { approved: true })
    if (repeated.documentId !== result.documentId) throw new Error('La aprobación repetida duplicó el documento')
    evidence.push({ runId: result.id, documentId: result.documentId, mode: result.mode })
    console.log(`OK vuelta ${i + 1}: documento creado y leído desde Ambiguous.`)
  }
  const restarted = new Workflow(new StateRepository(statePath), workspace)
  for (const item of evidence) {
    const run = await restarted.verify(item.runId)
    if (run.status !== 'succeeded' || run.error) throw new Error('Falló la lectura tras recargar el estado')
  }
  writeFileSync(resolve(dataDir, 'live-verification.json'), JSON.stringify({ at: new Date().toISOString(), taskIds: ids, evidence }, null, 2), { mode: 0o600 })
  console.log('OK persistencia: los tres documentos se leyeron después de reconstruir el servicio.')
  console.log('Evidencia privada: .local/live-verification.json. Este ensayo usa eventos por HTTP; falta el ensayo humano en la extensión.')
} finally { await new Promise<void>(resolve => server.close(() => resolve())) }
