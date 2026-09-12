import { loadEnvFile } from 'node:process'
import { resolve } from 'node:path'
import { createApp } from './controllers/api.js'
import { AmbiguousWorkspace } from './connectors/ambiguous.js'
import { StateRepository } from './repositories/state.js'
import { Workflow } from './services/workflow.js'

loadEnvFile(new URL('../../../.env', import.meta.url))
const workspace = new AmbiguousWorkspace(process.env.AMBIGUOUS_API_KEY ?? '')
const identity = await workspace.identity()
// Un archivo por workspace evita mezclar tareas al cambiar de credencial.
const path = resolve(process.env.DEJAVU_DATA_DIR ?? '../../.local', `state-${identity.workspace_id}-${identity.id}.json`)
const workflow = new Workflow(new StateRepository(path), workspace)
createApp(workflow, process.env.CORE_INGEST_TOKEN ?? '').listen(8080, '127.0.0.1', () => {
  console.log('Déjà Vu listo en 127.0.0.1:8080. Abrí Ambiguous con la extensión instalada.')
})
