import { chromium, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { createApp } from '../apps/core/src/controllers/api.js'
import { StateRepository } from '../apps/core/src/repositories/state.js'
import { Workflow } from '../apps/core/src/services/workflow.js'
import type { Document, Draft, Task, Workspace } from '../apps/core/src/models/index.js'

// Fixtures efímeros para verificar UI → API → detector → ejecución. No dataset,
// .env, persistencia ni acceso al proveedor real en esta prueba.
const token = randomUUID(), documents = new Map<string, Document>()
const tasks: Task[] = ['Revisar la propuesta', 'Coordinar el lanzamiento', 'Preparar la entrega'].map(title => ({
  id: randomUUID(), title, description: `Contexto de prueba de «${title}».`, status: 'Pendiente', priority: 'Media',
}))
let taskReadsFail = false, returnNoTasks = false, uncertainWrite = false, writes = 0
let now = Date.now()
const workspace: Workspace = {
  async identity() { return { id: randomUUID(), workspace_id: randomUUID(), display_name: 'Workspace de prueba', type: 'agent' } },
  async tasks() { if (taskReadsFail) throw new Error('Proveedor de prueba desconectado'); return { data: returnNoTasks ? [] : tasks, meta: { hasMore: false, nextCursor: null } } },
  async task(id) { const task = tasks.find(task => task.id === id); if (!task) throw new Error('Tarea de prueba inexistente'); return task },
  async createDocument(draft: Draft) { writes++; if (uncertainWrite) throw new Error('Respuesta perdida'); const document = { id: randomUUID(), ...draft }; documents.set(document.id, document); return document },
  async document(id) { const document = documents.get(id); if (!document) throw new Error('Documento no encontrado'); return document },
}
const startedAt = Date.now()
const workflow = new Workflow(new StateRepository(), workspace, () => now)
const app = createApp(workflow, token, { allowedOrigins: ['http://127.0.0.1:3100'] })
const server = await new Promise<ReturnType<typeof app.listen>>((ready, reject) => {
  const server = app.listen(8080, '127.0.0.1', () => ready(server)); server.once('error', reject)
})
const web = spawn(process.execPath, [resolve('apps/web/node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3100'], {
  cwd: resolve('apps/web'), env: { ...process.env, CORE_API_URL: 'http://127.0.0.1:8080', NEXT_TELEMETRY_DISABLED: '1' }, stdio: 'ignore',
})
for (let attempt = 0; attempt < 100; attempt++) {
  if (web.exitCode !== null) throw new Error('No pudo iniciarse el frontend de pruebas en 3100.')
  if (await fetch('http://127.0.0.1:3100').then(response => response.ok).catch(() => false)) break
  await new Promise(resolve => setTimeout(resolve, 300))
}
const profile = mkdtempSync(resolve(tmpdir(), 'dejavu-browser-'))
const context = await chromium.launchPersistentContext(profile, {
  channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 },
  args: ['--enable-unsafe-extension-debugging'],
  ignoreDefaultArgs: ['--disable-extensions'],
})
const errors: string[] = []
const page = context.pages()[0]
page.on('pageerror', error => errors.push(error.message))
const shots = resolve('.local/browser-qa')
mkdirSync(shots, { recursive: true, mode: 0o700 })

try {
  await page.goto('http://127.0.0.1:3100')
  await expect(page.getByRole('heading', { name: 'Conectá tu workspace' })).toBeVisible()
  await page.getByLabel('Token del core local').fill(token)
  await page.getByRole('button', { name: 'Conectar workspace' }).click()
  await expect(page.getByRole('heading', { name: 'Tareas del workspace' })).toBeVisible()
  await expect(page.getByText('Conectado en vivo', { exact: true })).toBeVisible()
  await page.screenshot({ path: resolve(shots, 'inicio.png'), fullPage: true })
  console.log('✓ Chrome instalado: conexión, estado vacío y SSE global.')
  for (const task of tasks.slice(0, 2)) {
    await page.getByRole('heading', { name: task.title, exact: true }).locator('../..').getByRole('button', { name: 'Preparar' }).click()
    await expect(page.getByRole('heading', { name: 'Prepará el traspaso' })).toBeVisible()
    await page.getByLabel('Título de la tarea', { exact: true }).fill(task.title)
    await page.getByLabel('Descripción de la tarea').fill(task.description!)
    now += 6_000
    await page.getByRole('button', { name: 'Preparar documento', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Revisá antes de guardar.' })).toBeVisible()
    expect(writes).toBe(documents.size)
    await page.getByRole('button', { name: 'Aprobar y guardar', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Contexto listo para continuar.' })).toBeVisible()
    await page.getByRole('link', { name: 'Preparar otro traspaso' }).click()
  }
  expect(documents.size).toBe(2)
  console.log('✓ Dos vueltas manuales: copia exacta, aprobación y documento verificado.')
  await page.getByRole('heading', { name: tasks[2].title, exact: true }).locator('../..').getByRole('button', { name: 'Preparar' }).click()
  await expect(page.getByRole('dialog')).toContainText('Hiciste esto 2 veces.')
  await page.screenshot({ path: resolve(shots, 'oferta.png'), fullPage: true })
  await page.getByRole('button', { name: 'Sí, preparalo' }).click()
  await expect(page.getByLabel('Contenido del documento a aprobar')).toContainText(tasks[2].description!)
  await page.getByRole('button', { name: 'Rechazar · no guardar' }).click()
  await expect(page.getByRole('heading', { name: 'Este documento no se guardó.' })).toBeVisible()
  expect(writes).toBe(2)
  console.log('✓ Oferta en tercera vuelta sin prompt; rechazo no escribe.')
  await page.getByRole('link', { name: 'Inicio', exact: true }).click()
  await page.getByRole('heading', { name: tasks[2].title, exact: true }).locator('../..').getByRole('button', { name: 'Preparar' }).click()
  await page.getByRole('button', { name: 'Sí, preparalo' }).click()
  now += 1_000
  await page.getByRole('button', { name: 'Aprobar y guardar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Contexto listo para continuar.' })).toBeVisible()
  const completedUrl = page.url()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Contexto listo para continuar.' })).toBeVisible()
  await page.getByRole('button', { name: 'Volver a leer desde Ambiguous' }).click()
  expect(writes).toBe(3)
  await page.screenshot({ path: resolve(shots, 'resultado.png'), fullPage: true })
  await page.getByRole('link', { name: 'Métricas', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'De la oferta al documento' })).toBeVisible()
  await page.screenshot({ path: resolve(shots, 'metricas.png'), fullPage: true })
  await page.getByRole('link', { name: 'Historial', exact: true }).click()
  await expect(page.getByRole('table')).toContainText('Verificado')
  await page.getByRole('link', { name: 'Rutinas', exact: true }).click()
  await page.getByRole('link', { name: /Revisión humana/ }).click()
  await expect(page.getByRole('heading', { name: 'Evidencia del patrón' })).toBeVisible()
  console.log('✓ Asistencia, recarga, lectura idempotente, historial, rutina y métricas.')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:3100')
  await expect(page.getByRole('heading', { name: 'Tareas del workspace' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: resolve(shots, 'movil.png'), fullPage: true })
  returnNoTasks = true
  await page.getByRole('button', { name: 'Actualizar tareas', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No hay tareas disponibles' })).toBeVisible()
  taskReadsFail = true
  await page.getByRole('button', { name: 'Actualizar tareas', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  taskReadsFail = false; returnNoTasks = false
  await page.getByRole('button', { name: 'Reintentar lectura' }).click()
  await expect(page.getByRole('heading', { name: tasks[0].title, exact: true })).toBeVisible()
  console.log('✓ Móvil sin desborde, vacío, error de proveedor y recuperación.')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('heading', { name: tasks[0].title, exact: true }).locator('../..').getByRole('button', { name: 'Preparar' }).click()
  await page.getByRole('button', { name: 'Sí, preparalo' }).click()
  uncertainWrite = true
  await page.getByRole('button', { name: 'Aprobar y guardar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'No se pudo confirmar el guardado.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Aprobar y guardar', exact: true })).toHaveCount(0)
  await page.getByRole('link', { name: 'Inicio', exact: true }).click()
  await page.getByRole('button', { name: 'Pausar observación' }).click()
  await expect(page.getByText('Observación pausada', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reanudar observación' }).click()
  console.log('✓ Escritura incierta sin reenvío y observación controlable.')

  // El ensayo acelera el reloj del workflow; conserva el límite HTTP real de 180/min.
  const remainingWindow = 61_000 - (Date.now() - startedAt)
  if (remainingWindow > 0) {
    console.log('Respetando la ventana de 180 solicitudes/min antes de probar la extensión…')
    await new Promise(resolve => setTimeout(resolve, Math.min(remainingWindow, 59_000)))
  }

  // Chrome actual admite instalación de extensión en perfil temporal por CDP.
  const session = await context.browser()!.newBrowserCDPSession()
  const { id: extensionId } = await session.send('Extensions.loadUnpacked', { path: resolve('apps/observer/dist') })
  const panel = await context.newPage()
  await panel.goto(`chrome-extension://${extensionId}/panel.html`)
  await panel.getByLabel('Token del core local').fill(token)
  await panel.getByRole('button', { name: 'Conectar', exact: true }).click()
  await expect(panel.getByText('Workspace de prueba · agent', { exact: true })).toBeVisible()
  const backToTasks = panel.getByRole('button', { name: 'Volver a las tareas', exact: true })
  if (await backToTasks.count()) await backToTasks.click()
  await expect(panel.getByRole('heading', { name: /Tareas del workspace/ })).toBeVisible()
  await expect(panel.getByRole('link', { name: /tablero/i })).toBeVisible()
  await panel.screenshot({ path: resolve(shots, 'extension.png'), fullPage: true })
  console.log('✓ Extensión MV3 instalada en Chrome: panel → background → API autenticada.')

  await page.goto(completedUrl)
  await expect(page.getByRole('heading', { name: 'Contexto listo para continuar.' })).toBeVisible()
  await page.getByRole('button', { name: 'Desconectar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Conectá tu workspace' })).toBeVisible()
  expect(errors).toEqual([])
  console.log('✓ Sin errores JavaScript. Prueba completa sin escrituras externas ni dataset.')
} finally {
  await context.close()
  web.kill('SIGTERM')
  rmSync(profile, { recursive: true, force: true })
  app.locals.closeStreams()
  await new Promise<void>(resolve => server.close(() => resolve()))
}
