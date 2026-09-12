import express, { type Request, type Response, type NextFunction } from 'express'
import { randomUUID, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { DomainError } from '../errors/index.js'
import { Workflow } from '../services/workflow.js'

export function createApp(workflow: Workflow, token: string) {
  if (token.length < 24) throw new Error('CORE_INGEST_TOKEN debe tener al menos 24 caracteres.')
  const app = express()
  app.disable('x-powered-by')
  app.use((_req, res, next) => {
    res.locals.requestId = randomUUID()
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
    next()
  })
  app.get('/healthz', (_req, res) => res.json({ status: 'ok' }))
  // Sin CORS: la extension usa su background y host_permissions. No se expone a sitios web.
  app.use((req, _res, next) => {
    const auth = Buffer.from(req.headers.authorization ?? '')
    const expected = Buffer.from(`Bearer ${token}`)
    if (auth.length !== expected.length || !timingSafeEqual(auth, expected)) {
      return next(new DomainError('UNAUTHORIZED', 'Configurá el token local en la extensión.'))
    }
    next()
  })
  app.use(express.json({ limit: '64kb' }))
  let requestWindow = Date.now(), requestCount = 0
  app.use((_req, _res, next) => {
    if (Date.now() - requestWindow > 60_000) { requestWindow = Date.now(); requestCount = 0 }
    next(++requestCount > 180 ? new DomainError('RATE_LIMITED', 'Demasiadas solicitudes; esperá un minuto.') : undefined)
  })
  const route = (handler: (req: Request, res: Response) => unknown) =>
    (req: Request, res: Response, next: NextFunction) => { Promise.resolve().then(() => handler(req, res)).catch(next) }
  const runId = (req: Request) => z.string().uuid().parse(req.params.id)
  app.get('/v1/workspace', route(async (_req, res) => res.json(await workflow.workspace.identity())))
  app.get('/v1/tasks', route(async (req, res) => {
    const cursor = z.string().regex(/^\d{1,7}$/).optional().parse(req.query.cursor)
    res.json(await workflow.workspace.tasks(cursor))
  }))
  app.get('/v1/state', route((req, res) => {
    const offset = z.coerce.number().int().min(0).default(0).parse(req.query.offset)
    const runs = [...workflow.state.runs].reverse()
    res.json({
      paused: workflow.state.paused,
      data: runs.slice(offset, offset + 20),
      meta: { offset, limit: 20, total: runs.length, hasMore: offset + 20 < runs.length },
      metrics: {
        observedEvents: workflow.state.events.length,
        manualCompleted: runs.filter(r => r.mode === 'manual' && r.status === 'succeeded').length,
        assistedCompleted: runs.filter(r => r.mode === 'assisted' && r.status === 'succeeded').length,
        rejected: runs.filter(r => r.status === 'rejected').length,
      },
    })
  }))
  app.post('/v1/runs', route(async (req, res) => {
    const body = z.object({ taskId: z.string().uuid(), id: z.string().uuid() }).strict().parse(req.body)
    res.status(201).json(await workflow.open(body.taskId, body.id))
  }))
  app.get('/v1/runs/:id', route((req, res) => res.json(workflow.get(runId(req)))))
  app.post('/v1/runs/:id/prepare', route((req, res) => {
    const body = z.discriminatedUnion('assisted', [
      z.object({ assisted: z.literal(true) }).strict(),
      z.object({ assisted: z.literal(false), title: z.string().max(255), description: z.string().max(12000) }).strict(),
    ]).parse(req.body)
    res.json(workflow.prepare(runId(req), body.assisted, body.assisted ? undefined : body))
  }))
  app.post('/v1/runs/:id/dismiss', route((req, res) => res.json(workflow.dismiss(runId(req)))))
  app.post('/v1/runs/:id/reject', route((req, res) => res.json(workflow.reject(runId(req)))))
  app.post('/v1/runs/:id/approve', route(async (req, res) => {
    z.object({ approved: z.literal(true) }).strict().parse(req.body)
    res.json(await workflow.approve(runId(req)))
  }))
  app.post('/v1/runs/:id/verify', route(async (req, res) => res.json(await workflow.verify(runId(req)))))
  app.post('/v1/observation', route((req, res) => {
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
    const status: Record<string, number> = { PAYLOAD_TOO_LARGE: 413, VALIDATION_FAILED: 400, UNAUTHORIZED: 401, NOT_FOUND: 404, CONFLICT: 409, RATE_LIMITED: 429, NOT_CONFIGURED: 503, PROVIDER_ERROR: 502, PROVIDER_UNAVAILABLE: 503 }
    res.status(status[code] ?? 500).json({ error: {
      code, message: validation ? 'Solicitud inválida.' : domain?.message ?? 'No se pudo completar la operación.',
      details: [], requestId: res.locals.requestId,
    } })
  })
  return app
}
