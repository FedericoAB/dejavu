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
}
export type ObservedEvent = RawEvent & { runId: string }
export type State = { version: 1; runs: Run[]; events: ObservedEvent[]; dismissedUntil: number; paused: boolean }
export interface Workspace {
  identity(): Promise<{ id: string; display_name: string; workspace_id: string; type: string }>
  tasks(cursor?: string): Promise<{ data: Task[]; meta: { nextCursor: string | null; hasMore: boolean } }>
  task(id: string): Promise<Task>
  createDocument(draft: Draft): Promise<Document>
  document(id: string): Promise<Document>
}
