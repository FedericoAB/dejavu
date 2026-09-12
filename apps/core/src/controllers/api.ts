import express, { type Request, type Response, type NextFunction } from 'express'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { DomainError } from '../errors/index.js'
import { Workflow } from '../services/workflow.js'
import { settingsUpdateSchema } from '../services/settings.js'
import type { Page, Run, SettingsManager } from '../models/index.js'

export type AppOptions = { allowedOrigins?: string[]; settings?: SettingsManager }

export function createApp(workflowSource: Workflow | (() => Workflow), tokenSource: string | (() => string), options: AppOptions = {}) {
  const getWorkflow = typeof workflowSource === 'function' ? workflowSource : () => workflowSource
  const getToken = typeof tokenSource === 'function' ? tokenSource : () => tokenSource
  if (getToken().length < 24) throw new Error('CORE_INGEST_TOKEN debe tener al menos 24 caracteres.')
  const allowedOrigins = new Set(options.allowedOrigins ?? ['http://127.0.0.1:3000', 'http://localhost:3000'])
  if ([...allowedOrigins].some(origin => !/^https?:\/\//.test(origin) || new URL(origin).origin !== origin)) {
    throw new Error('Los orígenes permitidos deben ser URLs HTTP completas sin ruta ni comodines.')
  }
  const app = express()
  const streams = new Set<Response>()
  app.locals.closeStreams = () => { for (const response of streams) response.end() }
  options.settings?.subscribe(() => app.locals.closeStreams())
  app.disable('x-powered-by')
  app.use((_req, res, next) => {
    res.locals.requestId = randomUUID()
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    next()
  })
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }))
  app.use((req, res, next) => {
    const origin = req.headers.origin
    // La extensión usa host_permissions, conserva su bearer y no recibe CORS web.
    const extension = origin && /^chrome-extension:\/\/[a-p]{32}$/.test(origin)
    res.vary('Origin')
    if (origin && !allowedOrigins.has(origin) && !extension) return next(new DomainError('FORBIDDEN', 'Este origen no está autorizado.'))
    if (origin && allowedOrigins.has(origin)) {
      res.set({
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Last-Event-ID',
        'Access-Control-Max-Age': '600',
      })
    }
    if (req.method === 'OPTIONS' && !extension) return res.sendStatus(204)
    next()
  })
  app.use((req, _res, next) => {
    const auth = Buffer.from(req.headers.authorization ?? '')
    const expected = Buffer.from(`Bearer ${getToken()}`)
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) {
      return next(new DomainError('UNAUTHORIZED', 'Configurá el token local para conectar con Déjà Vu.'))
    }
    next()
  })
  app.use(express.json({ limit: '64kb' }))
  let requestWindow = Date.now(), requestCount = 0
  app.use((_req, _res, next) => {
    if (Date.now() - requestWindow > 60_000) { requestWindow = Date.now(); requestCount = 0 }
    next(++requestCount > 180 ? new DomainError('RATE_LIMITED', 'Demasiadas solicitudes; esperá un minuto.') : undefined)
  })
  const route = (handler: (req: Request, res: Response, workflow: Workflow) => unknown) =>
    (req: Request, res: Response, next: NextFunction) => { Promise.resolve().then(() => handler(req, res, getWorkflow())).catch(next) }
  const runId = (req: Request) => z.string().uuid().parse(req.params.id)
  const page = <T>(req: Request, data: T[]): Page<T> => {
    const offset = z.coerce.number().int().min(0).default(0).parse(req.query.offset)
    const limit = z.coerce.number().int().min(1).max(200).default(20).parse(req.query.limit)
    return { data: data.slice(offset, offset + limit), meta: { offset, limit, total: data.length, hasMore: offset + limit < data.length } }
  }
  const api = express.Router()
  // Mantiene el contrato de la extensión y habilita el prefijo convencional del tablero.
  app.use(['/v1', '/api/v1'], api)
  const settings = () => {
    if (!options.settings) throw new DomainError('NOT_CONFIGURED', 'La configuración no está habilitada en esta instancia del core.')
    return options.settings
  }
  api.get('/settings', route((_req, res) => res.json(settings().get())))
  api.post('/settings/check', route(async (req, res) => {
    z.object({}).strict().parse(req.body ?? {})
    res.json(await settings().check())
  }))
  api.post('/settings', route(async (req, res) => res.json(await settings().update(settingsUpdateSchema.parse(req.body)))))
  api.get('/workspace', route(async (_req, res, workflow) => res.json(await workflow.workspace.identity())))
  api.get('/tasks', route(async (req, res, workflow) => {
    const cursor = z.string().regex(/^\d{1,7}$/).optional().parse(req.query.cursor)
    res.json(await workflow.workspace.tasks(cursor))
  }))
  api.get('/state', route((req, res, workflow) => {
    const runs = [...workflow.state.runs].reverse()
    res.json({
      paused: workflow.state.paused,
      ...page(req, runs),
      metrics: workflow.metrics(),
    })
  }))
  api.get('/patterns', route((req, res, workflow) => res.json(page(req, workflow.patterns()))))
  api.get('/routines', route((req, res, workflow) => res.json(page(req, workflow.routines()))))
  api.get('/routines/:id', route((req, res, workflow) => res.json(workflow.routine(z.string().parse(req.params.id)))))
  api.get('/metrics', route((_req, res, workflow) => res.json(workflow.metrics())))
  api.get('/runs', route((req, res, workflow) => res.json(page(req, [...workflow.state.runs].reverse()))))
  const startStream = (req: Request, res: Response) => {
    res.status(200).set({ 'Content-Type': 'text/event-stream; charset=utf-8', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' })
    res.flushHeaders()
    streams.add(res)
    res.write('retry: 2000\n\n')
    const heartbeat = setInterval(() => { res.write(': keepalive\n\n') }, 15_000)
    heartbeat.unref()
    req.on('close', () => { clearInterval(heartbeat); streams.delete(res) })
  }
  api.get('/stream', route((req, res, workflow) => {
    startStream(req, res)
    const send = () => {
      res.write(`id: ${workflow.state.revision ?? 0}\nevent: state\ndata: ${JSON.stringify({ revision: workflow.state.revision ?? 0, paused: workflow.state.paused })}\n\n`)
    }
    const unsubscribe = workflow.repository.subscribe(send)
    req.on('close', unsubscribe)
    send()
  }))
  api.get('/runs/:id/stream', route((req, res, workflow) => {
    const id = runId(req)
    const current = workflow.get(id)
    startStream(req, res)
    const send = (run: Run) => {
      res.write(`id: ${run.revision ?? 0}\nevent: run\ndata: ${JSON.stringify(run)}\n\n`)
    }
    const unsubscribe = workflow.subscribe(id, send)
    req.on('close', unsubscribe)
    // Al reconectar siempre manda la instantánea vigente, incluso tras reiniciar el core.
    send(current)
  }))
  api.post('/runs', route(async (req, res, workflow) => {
    const body = z.object({ taskId: z.string().uuid(), id: z.string().uuid() }).strict().parse(req.body)
    res.status(201).json(await workflow.open(body.taskId, body.id))
  }))
  api.get('/runs/:id', route((req, res, workflow) => res.json(workflow.get(runId(req)))))
  api.post('/runs/:id/prepare', route((req, res, workflow) => {
    const body = z.discriminatedUnion('assisted', [
      z.object({ assisted: z.literal(true) }).strict(),
      z.object({ assisted: z.literal(false), title: z.string().max(255), description: z.string().max(12000) }).strict(),
    ]).parse(req.body)
    res.json(workflow.prepare(runId(req), body.assisted, body.assisted ? undefined : body))
  }))
  api.post('/runs/:id/dismiss', route((req, res, workflow) => res.json(workflow.dismiss(runId(req)))))
  api.post('/runs/:id/reject', route((req, res, workflow) => res.json(workflow.reject(runId(req)))))
  api.post('/runs/:id/approve', route(async (req, res, workflow) => {
    z.object({ approved: z.literal(true) }).strict().parse(req.body)
    res.json(await workflow.approve(runId(req)))
  }))
  api.post('/runs/:id/verify', route(async (req, res, workflow) => res.json(await workflow.verify(runId(req)))))
  api.post('/observation', route((req, res, workflow) => {
    const { paused } = z.object({ paused: z.boolean() }).strict().parse(req.body)
    workflow.pause(paused)
    res.json({ paused })
  }))
  app.use((_req, _res, next) => next(new DomainError('NOT_FOUND', 'Ruta inexistente.')))
  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const validation = error instanceof z.ZodError || error instanceof SyntaxError
    const domain = error instanceof DomainError ? error : null
    const tooLarge = error instanceof Error && 'type' in error && error.type === 'entity.too.large'
    const code = tooLarge ? 'PAYLOAD_TOO_LARGE' : validation ? 'VALIDATION_FAILED' : domain?.code ?? 'INTERNAL_ERROR'
    if (res.headersSent) return res.end()
    const status: Record<string, number> = { PAYLOAD_TOO_LARGE: 413, VALIDATION_FAILED: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429, NOT_CONFIGURED: 503, PROVIDER_ERROR: 502, PROVIDER_UNAVAILABLE: 503 }
    res.status(status[code] ?? 500).json({ error: {
      code, message: validation ? 'Solicitud inválida.' : domain?.message ?? 'No se pudo completar la operación.',
      details: [], requestId: res.locals.requestId,
    } })
  })
  return app
}
