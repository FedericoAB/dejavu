export type { Run, Task, Draft, Workspace, Pattern, Routine, Metrics } from '../../../core/src/models/index'
export type Page<T> = { data: T[]; meta: { offset: number; limit: number; total: number; hasMore: boolean } }
