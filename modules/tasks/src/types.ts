import type { Clock } from '@heynixie/clock';
import type { CheckedTables } from '@heynixie/db';
import type { Definitions, Log, LogRecord, RecordInput, RecordKind } from '@heynixie/log';

export interface TasksContext {
  readonly log: Log;
  readonly clock: Clock;
  readonly definitions: () => Definitions;
}

export type TaskState = 'ready' | 'running' | 'waiting' | 'failed' | 'done';

export type LeaseKind = 'task' | 'action';

export interface Lease {
  readonly kind: LeaseKind;
  readonly workID: string;
  readonly holder: string;
  readonly generation: number;
  readonly epoch: number;
  readonly expiresAt: number;
}

export interface TaskClaim {
  readonly lease: Lease;
  readonly stepKey: string;
}

export interface StepErrored {
  readonly taskID: string;
  readonly stepKey: string;
  readonly errors: number;
  readonly errorLimit: number;
  readonly nextState: 'ready' | 'failed';

  readonly retryAt: number;
  readonly error: unknown;
}

export interface StepResult {
  readonly next: 'continue' | 'wait' | 'done';
  readonly records: readonly RecordInput[];
  readonly acknowledged: readonly number[];
  readonly timers?: readonly { readonly dueAt: number }[];

  readonly sessionBoundary?: string | null;
}

export interface StepInput {
  readonly taskID: string;
  readonly stepKey: string;

  readonly lease: Lease;
  readonly inbox: readonly LogRecord[];

  readonly sessionBoundary: string | null;

  readonly signal: AbortSignal;
}

export type RunStep = (input: StepInput) => Promise<StepResult>;

export interface SandboxCleanup {
  readonly removeStaleSandboxes: () => Promise<void>;
}

export type FaultPointID =
  | 'claim.after'
  | 'renew.before'
  | 'renew.after'
  | 'step.commit.before'
  | 'step.commit.after'
  | 'queue.commit.before'
  | 'queue.commit.after'
  | 'attempt.record.after'
  | 'attempt.result.before'
  | 'attempt.result.after'
  | 'timer.fire.before'
  | 'inbox.write.after'
  | 'recovery.step.1'
  | 'recovery.step.2'
  | 'recovery.step.3'
  | 'recovery.step.4'
  | 'recovery.step.5'
  | 'sigterm.grace'
  | 'memory.recall.ranked'
  | 'memory.recall.checked'
  | 'memory.forget.key_removed'
  | 'memory.lapse.read'
  | 'memory.approval.opened'
  | 'writer.batch.planned'
  | 'writer.batch.extracted'
  | 'writer.batch.gated'
  | 'writer.publish.inside'
  | 'writer.publish.before'
  | 'writer.publish.after';

export interface FaultPointContext {
  readonly kind: LeaseKind | 'recovery' | 'pool' | 'memory';
  readonly id: string | null;
}

export type FaultPointHandler = (
  id: FaultPointID,
  context: FaultPointContext,
) => Promise<void> | void;

interface TaskTable {
  readonly task_id: string;
  readonly is_conversation: number;
  readonly state: TaskState;
  readonly read_cursor: number;
  readonly last_inbox_sequence: number;
  readonly committed_steps: number;
  readonly started_step_key: string | null;
  readonly step_errors: number;
  readonly claimable_at: number;
  readonly session_boundary: string | null;
  readonly created_sequence: number;
  readonly updated_sequence: number;
}

interface TimerTable {
  readonly timer_id: string;
  readonly task_id: string;
  readonly due_at: number;
  readonly set_sequence: number;
  readonly fired_at: number | null;
  readonly fired_sequence: number | null;
}

interface LeaseTable {
  readonly kind: LeaseKind;
  readonly work_id: string;
  readonly holder: string | null;
  readonly expires_at: number | null;
  readonly epoch: number;
  readonly generation: number;
}

interface InboxRecordTable {
  readonly sequence: number;
  readonly thread: string | null;
  readonly kind: RecordKind;
}

export type TaskRow = TaskTable;

// Kysely's table map needs an index signature, which an interface lacks.
export type TasksTables = CheckedTables<
  Readonly<{
    tasks: TaskTable;
    timers: TimerTable;
    leases: LeaseTable;
    records: InboxRecordTable;
  }>,
  'records'
>;
