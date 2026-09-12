import { chromium, expect, type BrowserContext } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { createApp } from '../apps/core/src/controllers/api.js'
import { FileSettingsRepository } from '../apps/core/src/repositories/settings.js'
import { LocalRuntime } from '../apps/core/src/services/settings.js'
import type { Document, Draft, Task, Workspace } from '../apps/core/src/models/index.js'

// Prueba aislada. Credenciales y documentos ficticios, sin proveedor externo ni dataset.
let token = randomUUID()
const documents = new Map<string, Document>()
const tasks: Task[] = ['Revisar la propuesta', 'Coordinar el lanzamiento', 'Preparar la entrega'].map(title => ({
  id: randomUUID(), title, description: `Contexto de prueba de «${title}».`, status: 'Pendiente', priority: 'Media',
}))
const identity = { id: randomUUID(), workspace_id: randomUUID(), display_name: 'Workspace de prueba', type: 'agent' }
let taskReadsFail = false, returnNoTasks = false, uncertainWrite = false, writes = 0
const workspace: Workspace = {
  async identity() { return identity },
  async tasks() { if (taskReadsFail) throw new Error('Proveedor de prueba desconectado'); return { data: returnNoTasks ? [] : tasks, meta: { hasMore: false, nextCursor: null } } },
  async task(id) { const task = tasks.find(task => task.id === id); if (!task) throw new Error('Tarea inexistente'); return task },
  async createDocument(draft: Draft) { writes++; if (uncertainWrite) throw new Error('Respuesta perdida'); const document = { id: randomUUID(), ...draft }; documents.set(document.id, document); return document },
  async document(id) { const document = documents.get(id); if (!document) throw new Error('Documento no encontrado'); return document },
}
const directory = mkdtempSync(resolve(tmpdir(), 'dejavu-browser-'))
const envPath = resolve(directory, '.env')
writeFileSync(envPath, `CORE_INGEST_TOKEN=${token}\nUNCHANGED_SETTING=yes\n`, { mode: 0o600 })
const startedAt = Date.now()
const runtime = new LocalRuntime({ token, dataDirectory: resolve(directory, 'state'), settingsRepository: new FileSettingsRepository(envPath), workspace: key => {
  if (key !== 'ak_browser_fixture_valid') return { ...workspace, async identity() { throw new Error('Clave inválida de prueba') } }
  return workspace
} })
const app = createApp(() => runtime.workflow, () => runtime.token, { settings: runtime, allowedOrigins: ['http://127.0.0.1:3100'] })
let context: BrowserContext | undefined, web: ChildProcess | undefined, server: ReturnType<typeof app.listen> | undefined
try {
  server = await new Promise<ReturnType<typeof app.listen>>((ready, reject) => {
    const http = app.listen(8080, '127.0.0.1', () => ready(http)); http.once('error', reject)
  })
  web = spawn(process.execPath, [resolve('apps/web/node_modules/next/dist/bin/next'), 'dev', '--hostname', '127.0.0.1', '--port', '3100'], {
    cwd: resolve('apps/web'), env: { ...process.env, CORE_API_URL: 'http://127.0.0.1:8080', NEXT_TELEMETRY_DISABLED: '1' }, stdio: 'ignore',
  })
  for (let attempt = 0; attempt < 100; attempt++) {
    if (web.exitCode !== null) throw new Error('No pudo iniciarse el frontend de pruebas en 3100.')
    if (await fetch('http://127.0.0.1:3100', { signal: AbortSignal.timeout(1500) }).then(response => response.ok).catch(() => false)) break
    await new Promise(resolve => setTimeout(resolve, 300))
  }
  context = await chromium.launchPersistentContext(resolve(directory, 'chrome'), {
    channel: 'chrome', headless: true, viewport: { width: 1440, height: 1000 },
    args: ['--enable-unsafe-extension-debugging'], ignoreDefaultArgs: ['--disable-extensions'],
  })
  const errors: string[] = [], page = context.pages()[0]
  page.on('pageerror', error => errors.push(error.message))
  const shots = resolve('.local/browser-qa')
  mkdirSync(shots, { recursive: true, mode: 0o700 })
  await page.goto('http://127.0.0.1:3100')
  await expect(page.getByRole('heading', { name: 'Conexiones', exact: true })).toBeVisible()
  await page.getByLabel('Token del core', { exact: true }).fill(token)
  await page.getByRole('button', { name: 'Conectar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible()
  await expect(page.getByText('Pendiente', { exact: true })).toBeVisible()
  await page.getByLabel('API key de Ambiguous', { exact: true }).fill('ak_browser_fixture_invalid')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('main').getByRole('alert')).toContainText('No se pudo validar')
  expect(readFileSync(envPath, 'utf8')).not.toContain('AMBIGUOUS_API_KEY')
  await page.getByLabel('API key de Ambiguous', { exact: true }).fill('ak_browser_fixture_valid')
  await page.getByRole('button', { name: 'Guardar cambios' }).click()
  await expect(page.getByRole('status')).toContainText('Cambios guardados')
  await expect(page.getByLabel('API key de Ambiguous', { exact: true })).toHaveValue('')
  expect(readFileSync(envPath, 'utf8')).toContain('UNCHANGED_SETTING=yes')
  const snapshot = await fetch('http://127.0.0.1:8080/v1/settings', { headers: { Authorization: `Bearer ${token}` } }).then(response => response.text())
  expect(snapshot).not.toContain('ak_browser_fixture_valid'); expect(snapshot).not.toContain(token)
  await page.screenshot({ path: resolve(shots, 'configuracion.png'), fullPage: true })
  console.log('✓ Configuración sin proveedor, rechazo de clave inválida, guardado privado y GET sin secretos.')
  await page.getByRole('link', { name: 'Traspasos', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Tareas', exact: true })).toBeVisible()
  await expect(page.getByText('En línea', { exact: true })).toBeVisible()
  await page.screenshot({ path: resolve(shots, 'inicio.png'), fullPage: true })
  for (const task of tasks.slice(0, 2)) {
    await page.getByRole('button', { name: `Preparar ${task.title}`, exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Origen', exact: true })).toBeVisible()
    await page.getByLabel('Título de la tarea', { exact: true }).fill(task.title)
    await page.getByLabel('Descripción de la tarea', { exact: true }).fill(task.description!)
    await new Promise(resolve => setTimeout(resolve, 5_200))
    await page.getByRole('button', { name: 'Preparar documento', exact: true }).click()
    await expect(page.getByLabel('Contenido del documento a aprobar')).toBeVisible()
    expect(writes).toBe(documents.size)
    await page.getByRole('button', { name: 'Aprobar y guardar', exact: true }).click()
    await expect(page.getByText('Documento verificado', { exact: true })).toBeVisible()
    await page.getByRole('link', { name: 'Siguiente tarea' }).click()
  }
  expect(documents.size).toBe(2)
  await page.getByRole('button', { name: `Preparar ${tasks[2].title}`, exact: true }).click()
  await expect(page.getByRole('dialog')).toContainText('Hiciste esto 2 veces.')
  await page.screenshot({ path: resolve(shots, 'oferta.png'), fullPage: true })
  await page.getByRole('button', { name: 'Sí, preparalo' }).click()
  await expect(page.getByLabel('Contenido del documento a aprobar')).toContainText(tasks[2].description!)
  await page.getByRole('button', { name: 'Rechazar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Traspaso cancelado' })).toBeVisible()
  expect(writes).toBe(2)
  console.log('✓ Tareas y editor juntos: dos vueltas, tercera oferta y rechazo sin escritura.')
  await page.getByRole('link', { name: 'Siguiente tarea' }).click()
  await page.getByRole('button', { name: `Preparar ${tasks[2].title}`, exact: true }).click()
  await page.getByRole('button', { name: 'Sí, preparalo' }).click()
  await page.getByRole('button', { name: 'Aprobar y guardar', exact: true }).click()
  await expect(page.getByText('Documento verificado', { exact: true })).toBeVisible()
  const completedUrl = page.url()
  await page.reload()
  await expect(page.getByText('Documento verificado', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Volver a leer', exact: true }).click()
  expect(writes).toBe(3)
  await page.screenshot({ path: resolve(shots, 'resultado.png'), fullPage: true })
  await page.getByRole('link', { name: 'Métricas', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Actividad', exact: true })).toBeVisible()
  await page.screenshot({ path: resolve(shots, 'metricas.png'), fullPage: true })
  await page.getByRole('link', { name: 'Historial', exact: true }).click()
  await expect(page.getByRole('table')).toContainText('Verificado')
  await page.getByRole('link', { name: 'Rutinas', exact: true }).click()
  await page.getByRole('link', { name: /Revisión humana/ }).click()
  await expect(page.getByRole('heading', { name: 'Repeticiones' })).toBeVisible()
  console.log('✓ Asistencia, recarga, SSE, historial, rutinas y métricas separadas.')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('http://127.0.0.1:3100')
  await expect(page.getByRole('heading', { name: 'Tareas', exact: true })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: resolve(shots, 'movil.png'), fullPage: true })
  returnNoTasks = true
  await page.getByRole('button', { name: 'Actualizar tareas', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Sin tareas', exact: true })).toBeVisible()
  taskReadsFail = true
  await page.getByRole('button', { name: 'Actualizar tareas', exact: true }).click()
  await expect(page.getByRole('main').getByRole('alert')).toBeVisible()
  taskReadsFail = false; returnNoTasks = false
  await page.getByRole('button', { name: 'Reintentar lectura' }).click()
  await expect(page.getByRole('button', { name: `Preparar ${tasks[0].title}`, exact: true })).toBeVisible()
  console.log('✓ Móvil, vacío, error y recuperación.')
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.getByRole('button', { name: `Preparar ${tasks[0].title}`, exact: true }).click()
  await page.getByRole('button', { name: 'Sí, preparalo' }).click()
  uncertainWrite = true
  await page.getByRole('button', { name: 'Aprobar y guardar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Guardado sin confirmar', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Aprobar y guardar', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Pausar', exact: true }).click()
  await expect(page.getByText('Pausado', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reanudar', exact: true }).click()
  console.log('✓ Estado incierto sin reenvío; pausa y reanudación.')

  // La prueba automatizada acumula más lecturas que el recorrido humano.
  const remainingWindow = 61_000 - (Date.now() - startedAt)
  if (remainingWindow > 0) await new Promise(resolve => setTimeout(resolve, Math.min(remainingWindow, 59_000)))
  await page.getByRole('link', { name: 'Configuración', exact: true }).click()
  const previousToken = token
  await page.getByRole('button', { name: 'Generar token', exact: true }).click()
  token = await page.getByLabel('Nuevo token del core', { exact: true }).inputValue()
  await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Actualizá el token')
  expect((await fetch('http://127.0.0.1:8080/v1/settings', { headers: { Authorization: `Bearer ${previousToken}` } })).status).toBe(401)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Configuración', exact: true })).toBeVisible()
  await expect(page.getByLabel('API key de Ambiguous', { exact: true })).toHaveValue('')
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: resolve(shots, 'configuracion-movil.png'), fullPage: true })
  console.log('✓ Rotación de token, revocación del anterior y sesión recuperada tras recarga.')
  const cdp = await context.browser()!.newBrowserCDPSession()
  const { id: extensionId } = await cdp.send('Extensions.loadUnpacked', { path: resolve('apps/observer/dist') })
  const panel = await context.newPage()
  await panel.goto(`chrome-extension://${extensionId}/panel.html`)
  await panel.getByLabel('Token del core local').fill(token)
  await panel.getByRole('button', { name: 'Conectar', exact: true }).click()
  await expect(panel.getByRole('heading', { name: /Tareas/ })).toBeVisible()
  await expect(panel.getByRole('link', { name: /Configuración/ })).toHaveAttribute('href', 'http://127.0.0.1:3000/settings')
  await panel.screenshot({ path: resolve(shots, 'extension.png'), fullPage: true })
  await page.goto(completedUrl)
  await expect(page.getByText('Documento verificado', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Configuración', exact: true }).click()
  await page.getByRole('button', { name: 'Desconectar', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Conexiones', exact: true })).toBeVisible()
  expect(errors).toEqual([])
  console.log('✓ MV3 con token nuevo y acceso a Configuración. Sin errores JS ni datos externos.')
} catch (error) {
  const page = context?.pages()[0]
  if (page) {
    await page.screenshot({ path: resolve('.local/browser-qa/failure.png'), fullPage: true }).catch(() => {})
    console.error('UI al fallar:', await page.locator('body').innerText().catch(() => 'No disponible'))
  }
  throw error
} finally {
  await context?.close()
  web?.kill('SIGTERM')
  app.locals.closeStreams()
  await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve())
  runtime.close()
  rmSync(directory, { recursive: true, force: true })
}
