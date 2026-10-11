import type { Definitions, Log, LogRecord, RecordInput } from '@heynixie/log';

// The one clock that leases, renewals, timers, retry delays and every wait read, in milliseconds
// since the epoch. A test build passes a clock the test sets and advances, so no test sleeps to let
// time pass. A sleep resolves early, never rejects, when its signal aborts.
export interface Clock {
  readonly now: () => number;
  readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>;
}

// What every tasks and actions entry point needs: a log whose projections include the tasks
// projections, the clock, and the definitions in force, which every record carries.
export interface TasksContext {
  readonly log: Log;
  readonly clock: Clock;
  readonly definitions: () => Definitions;
}

// The task states that slice 1 reaches. Pause, stop and close arrive in slice 2.
export type TaskState = 'ready' | 'running' | 'waiting' | 'failed' | 'done';

export type LeaseKind = 'task' | 'action';

// A runner's hold on one piece of work. Every write the work makes checks the generation, so a
// runner whose lease expired, or that another runner claimed since, commits nothing.
export interface Lease {
  readonly kind: LeaseKind;
  readonly workID: string;
  readonly holder: string;
  readonly generation: number;
  readonly epoch: number;
  readonly expiresAt: number;
}

// A claimed task and the key of the step the claim started.
export interface TaskClaim {
  readonly lease: Lease;
  readonly stepKey: string;
}

// What a step gives back: whether the task has more to do now, waits, or has finished; the inbox
// sequences it read, over whose contiguous run the cursor moves; and timers that fire into the
// task's inbox at dueAt.
export interface StepResult {
  readonly next: 'continue' | 'wait' | 'done';
  readonly records: readonly RecordInput[];
  readonly acknowledged: readonly number[];
  readonly timers?: readonly { readonly dueAt: number }[];

  // the SDK session's last chain entry, where a rerun after a crash forks
  readonly sessionBoundary?: string | null;
}

export interface StepInput {
  readonly taskID: string;
  readonly stepKey: string;

  // the step's lease, which every write the step makes, such as queuing an action, checks
  readonly lease: Lease;
  readonly inbox: readonly LogRecord[];

  // aborts when the lease is lost, so the step stops work that can no longer commit
  readonly signal: AbortSignal;
}

// Runs one step of a task, such as one model turn. The server supplies it.
export type RunStep = (input: StepInput) => Promise<StepResult>;

// Recovery step 5: destroys every sandbox that belongs to a step that no longer runs, through the
// adapter that made it. The server builds it from the sandbox module, which tasks never imports.
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
  | 'sigterm.grace';

// Which work reached a fault point: a task or an action by ID, recovery, or a runner pool.
export interface FaultPointContext {
  readonly kind: LeaseKind | 'recovery' | 'pool';
  readonly id: string | null;
}

// The crash harness's hook: it reports the arrival, then holds the runner until the test kills the
// process or releases it.
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

// the columns of the log's records table that the inbox reads
interface InboxRecordTable {
  readonly sequence: number;
  readonly thread: string | null;
  readonly kind: string;
}

export type TaskRow = TaskTable;

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type TasksTables = Readonly<{
  tasks: TaskTable;
  timers: TimerTable;
  leases: LeaseTable;
  records: InboxRecordTable;
}>;
