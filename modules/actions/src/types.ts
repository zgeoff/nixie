import type { CheckedTables } from '@heynixie/db';
import type { Decision, JSONObject } from '@heynixie/log';
import type { TaskClaim, TasksTables } from '@heynixie/tasks';

export type ActionStatus = 'pending' | 'done' | 'failed' | 'unknown';

export type OutcomeReason =
  | 'refused'
  | 'refusal_can_clear'
  | 'retries_exhausted'
  | 'ambiguous'
  | 'attempt_without_result'
  | 'unknown_tool'
  | 'arguments_unreadable';

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
}

export type ModelView =
  | { readonly status: 'done'; readonly actionID: string; readonly result: JSONObject | null }
  | { readonly status: 'failed'; readonly actionID: string; readonly reason: string }
  | { readonly status: 'pending'; readonly actionID: string; readonly message: string }
  | { readonly status: 'unknown'; readonly actionID: string; readonly message: string }
  | { readonly status: 'cancelled'; readonly actionID: string; readonly message: string };

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
}

export type ActionRow = ActionTable;

// Mapped types, because Kysely's table map needs the index signature that an interface lacks.
export type ActionsTables = TasksTables & CheckedTables<Readonly<{ actions: ActionTable }>>;
