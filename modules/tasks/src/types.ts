import type { BudgetsContext } from '@heynixie/budgets';
import type { Clock } from '@heynixie/clock';
import type { Trigger, taskMessageKindSchema } from '@heynixie/contract';
import type { CheckedTables } from '@heynixie/db';
import type {
  Definitions,
  JSONObject,
  Log,
  LogRecord,
  RecordInput,
  RecordKind,
} from '@heynixie/log';
import type { ResumeState, TaskState } from '@heynixie/task-control';
import type { HarnessCapability } from '@heynixie/wire';
import type { Kysely } from 'kysely';
import type { z } from 'zod';
import type { ReportShape } from './report/types';
import type { RunLimits, RunSettings, TaskRun } from './run/types';
import type { TaskRunnerRegistry } from './runner/types';

export interface TasksContext {
  readonly log: Log;
  readonly clock: Clock;
  readonly definitions: () => Definitions;

  // what a purchase at the queue charges and a failed or cancelled action credits; absent, the
  // deployment holds no budgets
  readonly budgets?: BudgetsContext;

  // what a claim and the end of a task run read: the report defaults, the meters and the hop limit
  readonly runSettings: RunSettings;

  // the runner of each task: the definitions, built once before any part starts
  readonly runners: TaskRunnerRegistry;

  // the version a definition hash names, or null when no row holds it. A caller inside a write
  // transaction passes it as the handle, so the read does not wait on that transaction.
  readonly readDefinitionVersion: ReadDefinitionVersion;
  readonly readDefinitionRunPolicy: ReadDefinitionRunPolicy;

  // the next fire of a definition as an ISO instant, or null when no slot is left. The triggers
  // module builds it.
  readonly readDefinitionNextFire: ReadDefinitionNextFire;
}

export interface DefinitionVersion {
  readonly definitionID: string;
  readonly name: string;
  readonly brief: string;

  // '' when the folder holds no instructions.md
  readonly instructions: string;

  // null: the model profile of the model role task
  readonly model: string | null;
  readonly profile: string | null;
  readonly persona: TaskPersona;
  readonly memory: TaskMemory;
  readonly log: TaskLog;
  readonly tools: readonly string[];
  readonly context: 'fresh' | 'continuing';
  readonly wakeable: boolean;

  // null: the definition fires by no trigger
  readonly trigger: Trigger | null;
}

export type ReadDefinitionVersion = (
  db: Kysely<unknown>,
  definitionHash: string,
) => Promise<DefinitionVersion | null>;

// What a task run of a definition's version pins when it opens, and what the end of a step reads.
export interface DefinitionRunPolicy {
  // null: the definition declares none, and the claim takes the default for a definition
  readonly report: TaskReport | null;
  readonly reportShape: ReportShape | null;
  readonly wakeable: boolean;
  readonly limits: RunLimits;
}

export type ReadDefinitionNextFire = (
  db: Kysely<unknown>,
  definitionID: string,
) => Promise<string | null>;

export type ReadDefinitionRunPolicy = (
  db: Kysely<unknown>,
  taskID: string,
  definitionHash: string,
) => Promise<DefinitionRunPolicy | null>;

export type {
  ResumeState,
  TaskControl,
  TaskControlRefusal,
  TaskState,
} from '@heynixie/task-control';

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
  readonly wake: StepWake;
}

export interface StartedClaim extends TaskClaim {
  readonly startSequence: number;
}

export type TaskMessageKind = z.infer<typeof taskMessageKindSchema>;

export type TaskWaitState = 'none' | 'open' | 'answered' | 'released';

export type WakeCause =
  | { readonly kind: 'owner' }
  | { readonly kind: 'timer' }
  | { readonly kind: 'event' }
  | { readonly kind: 'task'; readonly taskID: string }
  | { readonly kind: 'carried' };

export interface StepWake {
  readonly hop: number;
  readonly cause: WakeCause;
}

export interface TaskProfile {
  readonly taskID: string;
  readonly name: string;
  readonly brief: string;
  readonly wakeable: boolean;

  // who a message from the task speaks as: the conversation, a task with the persona, or a task
  // without it
  readonly speaker: TaskSpeaker;
}

export type TaskSpeaker = 'conversation' | 'persona_task' | 'plain_task';

export type TaskPersona = 'default' | 'none';

export type TaskMemory = 'none' | 'read';

export type TaskReport = 'wake' | 'next_turn' | 'none';

export interface TaskLimits {
  readonly turns: number;
  readonly dollars: number;
}

export type TaskLog = 'own' | 'conversation';

export interface TaskRunOptions {
  readonly model: string | null;

  readonly profile: string | null;
  readonly persona: TaskPersona;
  readonly memory: TaskMemory;
  readonly log: TaskLog;
  readonly tools: readonly string[];
  readonly report: TaskReport;
  readonly limits: TaskLimits;

  // the report shape that the start declared, which a task run pins at its claim
  readonly reportShape?: ReportShape;
}

export interface TaskModelChoice {
  readonly name: string;
  readonly profile: string;
  readonly description: string;

  // what a task needs that the harness of the model's profile lacks
  readonly missing: readonly HarnessCapability[];
}

export interface TaskStartBounds {
  readonly models: readonly TaskModelChoice[];
  readonly limits: { readonly default: TaskLimits; readonly max: TaskLimits };

  readonly memoryTools: {
    readonly read: readonly string[];
    readonly write: readonly string[];
  };
  readonly conversationTools: readonly string[];

  // how a task reports when its start sets no report
  readonly reportDefaults: RunSettings['reportDefaults'];
}

export interface TaskMessaging {
  readonly directory: readonly TaskProfile[];

  // the profiles of tasks in no directory, which only labels read
  readonly unlisted: readonly TaskProfile[];
  readonly hopLimit: number;
  readonly ownerName: string | null;
  readonly agentName: string | null;
}

export interface StepErrored {
  readonly taskID: string;
  readonly stepKey: string;
  readonly errors: number;
  readonly errorLimit: number;
  readonly nextState: 'ready' | 'waiting' | 'failed';

  readonly retryAt: number;
  readonly error: unknown;
}

export interface StepResult {
  readonly next: 'continue' | 'wait' | 'hold' | 'done';

  // what a runner tells the end of a task run: whether the step did work, a limit that it reached,
  // and the report that a runner with no model writes in place of a task.report call
  readonly run?: {
    readonly activity: 'worked' | 'none';
    readonly limit?: {
      readonly meter: 'turns' | 'dollars';
      readonly used: number;
      readonly limit: number;
    };
    readonly report?: {
      readonly summary: string;
      readonly fields?: JSONObject;
    };
  };
  readonly records: readonly RecordInput[];
  readonly acknowledged: readonly number[];
  readonly timers?: readonly { readonly dueAt: number }[];

  readonly sessionBoundary?: string | null;

  // the dollars that only the step's records count, which a commit that fails records as spend
  // instead
  readonly spentDollars?: number;
}

export interface StepInput {
  // the open task run, or null for a task with none, such as the conversation
  readonly run: TaskRun | null;

  readonly taskID: string;
  readonly stepKey: string;

  readonly lease: Lease;
  readonly inbox: readonly LogRecord[];

  readonly wake: StepWake;

  readonly sessionBoundary: string | null;

  readonly signal: AbortSignal;

  readonly interrupt: AbortSignal;
}

export type RunStep = (input: StepInput) => Promise<StepResult>;

export interface SandboxCleanup {
  readonly removeStaleSandboxes: () => Promise<void>;
}

export type FaultPointID =
  | 'claim.before'
  | 'claim.after'
  | 'trigger.batch.before'
  | 'trigger.batch.after'
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
  | 'task_list.read.after'
  | 'turn.reply.after'
  | 'time.now.running'
  | 'recovery.step.1'
  | 'recovery.step.2'
  | 'recovery.step.3'
  | 'recovery.step.4'
  | 'recovery.step.5'
  | 'recovery.pause.committed'
  | 'recovery.pause.marker_cleared'
  | 'sigterm.grace'
  | 'memory.recall.ranked'
  | 'memory.recall.checked'
  | 'memory.forget.key_removed'
  | 'memory.lapse.read'
  | 'memory.approval.opened'
  | 'memory.purge.keys_created'
  | 'memory.purge.closed'
  | 'memory.purge.keys_removed'
  | 'record.forget.started'
  | 'record.forget.purged'
  | 'backup.set.copied';

export interface FaultPointContext {
  readonly kind: LeaseKind | 'recovery' | 'pool' | 'memory' | 'backup' | 'trigger';
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
  readonly step_hop: number;
  readonly started_by: string | null;
  readonly start_step: string | null;
  readonly definition_id: string | null;
  readonly definition_hash: string | null;
  readonly pause_requested: number;
  readonly resume_state: ResumeState | null;
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
  readonly withdrawn_sequence: number | null;
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
  readonly recorded_at: number;
  readonly thread: string | null;
  readonly kind: RecordKind;
  readonly payload: string;
}

interface TaskMessageTable {
  readonly message_id: string;
  readonly from_task: string;
  readonly to_task: string;
  readonly kind: TaskMessageKind;
  readonly reply_to: string | null;
  readonly wait_state: TaskWaitState;
  readonly sent_sequence: number;
}

interface TaskRunTable {
  readonly run_id: string;
  readonly task_id: string;
  readonly opened_sequence: number;
  readonly started_at: number;
  readonly definition_id: string | null;
  readonly opened: string;
  readonly report_id: string | null;
  readonly ended_sequence: number | null;
  readonly ended_at: number | null;
  readonly ended: string | null;
}

interface PauseTable {
  readonly id: number;
}

interface PauseExemptionTable {
  readonly task_id: string;
  readonly exempt_sequence: number;
}

export type TaskRow = TaskTable;

// Kysely's table map needs an index signature, which an interface lacks.
export interface ClaimCandidate {
  readonly workID: string;
  readonly taskID: string;
}

export type TasksTables = CheckedTables<
  Readonly<{
    tasks: TaskTable;
    timers: TimerTable;
    leases: LeaseTable;
    records: InboxRecordTable;
    task_messages: TaskMessageTable;
    task_runs: TaskRunTable;
    nixie_pause: PauseTable;
    pause_exemptions: PauseExemptionTable;
  }>,
  'records' | 'nixie_pause' | 'pause_exemptions'
>;
