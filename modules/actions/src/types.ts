import type { CheckedTables } from '@heynixie/db';
import type { Decision, JSONObject } from '@heynixie/log';
import type { CallDestination, Effect } from '@heynixie/policy';
import type { TaskClaim, TasksTables } from '@heynixie/tasks';
import type { ToolImage } from '@heynixie/tools';

export type ActionStatus = 'pending' | 'done' | 'failed' | 'unknown';

export type OutcomeReason =
  | 'refused'
  | 'refusal_can_clear'
  | 'retries_exhausted'
  | 'ambiguous'
  | 'attempt_without_result'
  | 'unknown_tool'
  | 'arguments_unreadable'
  | 'deadline_passed'
  | 'rule_denied'
  | 'declined'
  | 'lapsed'
  | 'destinations_changed'
  | 'dropped';

// Why an action whose outcome is unknown came to the owner.
export type OwnerReason =
  | 'inconclusive'
  | 'unknown_streak'
  | 'no_reconcile'
  | 'key_expired'
  | 'not_found_ask';

export type ActionRiskClass = 'routine' | 'always_ask' | 'lifting';

// Lets one call of the tool start, or answers null while the tool is held. The call counts as
// running from that moment, so a hold that begins later waits for it, until its admission's release
// ends it.
export type AdmitTool = (tool: string) => Admission | null;

// One call let past a hold. The call runs inside `run`, so the tool's system can tell it from a call
// that was not admitted. `release` may run more than once.
export interface Admission {
  readonly run: <Result>(work: () => Promise<Result>) => Promise<Result>;
  readonly release: () => void;
}

export type CheckAnswer = 'found' | 'not_found' | 'inconclusive';

export type UnknownChoice = 'happened' | 'retry' | 'drop';

export type Outcome =
  | { readonly status: 'done' }
  | { readonly status: 'failed'; readonly reason: OutcomeReason }
  | { readonly status: 'pending'; readonly reason: OutcomeReason; readonly delayMs: number }
  | { readonly status: 'unknown'; readonly reason: OutcomeReason };

export interface AllowedCall {
  readonly step: TaskClaim;
  readonly tool: string;
  readonly actionHash: string;
  readonly arguments: JSONObject;
  readonly decision: Decision;

  // the tool_called record of the call, which the check before each attempt reads again
  readonly callSequence?: number;
  readonly deadlineAt?: number | null;
  readonly effects?: readonly Effect[];
  readonly destinations?: readonly CallDestination[];
  readonly content?: readonly string[];
}

export type ModelView =
  | {
      readonly status: 'done';
      readonly actionID: string;
      readonly result: JSONObject | null;

      // the pictures the connector's result carried, which the model reads beside it
      readonly images?: readonly ToolImage[];
    }
  | { readonly status: 'failed'; readonly actionID: string; readonly reason: string }
  | { readonly status: 'pending'; readonly actionID: string; readonly message: string }
  | { readonly status: 'unknown'; readonly actionID: string; readonly message: string }
  | { readonly status: 'cancelled'; readonly actionID: string; readonly message: string };

export interface ListedAction {
  readonly actionID: string;
  readonly tool: string;
}

// What became of an approved action, as its approval's card shows it.
export interface ApprovedCall {
  readonly state: 'waiting' | 'applied' | 'failed' | 'unknown';
  readonly reason: string | null;
}

export interface ActionCounts {
  readonly queued: number;
  readonly started: number;
  readonly cancelled: number;
}

interface ActionTable {
  readonly action_id: string;
  readonly task_id: string;
  readonly step_key: string;
  readonly action_hash: string;
  readonly tool: string;
  readonly status: ActionStatus;
  readonly attempt_count: number;
  readonly attempt_open: number;
  readonly next_attempt_at: number;
  readonly reason: OutcomeReason | null;
  readonly queued_sequence: number;
  readonly outcome_sequence: number | null;
  readonly updated_sequence: number;
  readonly cancelled_sequence: number | null;
  readonly call_sequence: number | null;
  readonly deadline_at: number | null;
  readonly risk_class: ActionRiskClass;
  readonly is_approved: 0 | 1;

  // 1 for an approved call to a tool that runs inside the turn, which the task's step runs
  readonly runs_in_step: 0 | 1;
  readonly held_by_proposal_id: string | null;
  readonly unknown_streak: number;
  readonly first_attempt_at: number | null;
  readonly last_attempt_at: number | null;
  readonly reconcile_at: number | null;
}

export type ActionRow = ActionTable;

// Mapped types, because Kysely's table map needs the index signature that an interface lacks.
export type ActionsTables = TasksTables & CheckedTables<Readonly<{ actions: ActionTable }>>;
