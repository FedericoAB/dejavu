import type { RawEvent } from '@dejavu/detector'

export type Task = { id: string; title: string; description: string | null; status: string; priority: string; due_date?: string | null }
export type Document = { id: string; title: string; content: string | null }
export type Draft = { title: string; content: string }
export type Run = {
  id: string
  task: Task
  mode: 'manual' | 'assisted'
  status: 'opened' | 'waiting_approval' | 'writing' | 'created' | 'succeeded' | 'rejected' | 'uncertain'
  openedAt: string
  draft?: Draft
  documentId?: string
  verifiedAt?: string
  error?: string
  offer?: { support: number; medianDurationMs: number }
  revision?: number
  preparedAt?: string
  approvedAt?: string
  offeredAt?: string
  dismissedAt?: string
  rejectedAt?: string
}
export type Page<T> = { data: T[]; meta: { offset: number; limit: number; total: number; hasMore: boolean } }
export type Pattern = {
  id: string
  name: string
  description: string
  support: number
  score: number
  medianDurationMs: number
  detectedAt: string
  steps: { kind: string; title: string }[]
  occurrences: { runId: string; startedAt: string; endedAt: string; durationMs: number }[]
}
export type Routine = {
  id: string
  name: string
  description: string
  source: 'fixed-template'
  requiresApproval: true
  enabled: true
  estimatedManualMs: number | null
  steps: { id: string; title: string; kind: string }[]
}
export type Metrics = {
  observedEvents: number
  manualCompleted: number
  assistedCompleted: number
  offered: number
  approved: number
  rejected: number
  dismissed: number
  activeRuns: number
  medianManualDurationMs: number | null
  estimatedSavedMs: number | null
  paused: boolean
}
export type ObservedEvent = RawEvent & { runId: string }
export type State = { version: 1; revision?: number; runs: Run[]; events: ObservedEvent[]; dismissedUntil: number; paused: boolean }
export interface Workspace {
  identity(): Promise<{ id: string; display_name: string; workspace_id: string; type: string }>
  tasks(cursor?: string): Promise<{ data: Task[]; meta: { nextCursor: string | null; hasMore: boolean } }>
  task(id: string): Promise<Task>
  createDocument(draft: Draft): Promise<Document>
  document(id: string): Promise<Document>
}
