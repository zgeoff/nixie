import type { Decision, JSONObject } from '@heynixie/log';
import type { TaskClaim, TasksTables } from '@heynixie/tasks';

// The 4 outcomes of an action. pending covers both a queued action and one waiting for a retry.
export type ActionStatus = 'pending' | 'done' | 'failed' | 'unknown';

// A provider's answer to one attempt, as the connector reads it: success, a refusal with no effect,
// a refusal with no effect that can clear, or a timeout, dropped connection or other ambiguity.
export type ProviderResponse =
  | { readonly kind: 'success'; readonly result: JSONObject }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'refused_retryable'; readonly reason: string; readonly retryAfterMs?: number }
  | { readonly kind: 'ambiguous'; readonly reason: string };

// One attempt of an action. The action ID is the idempotency key, so a provider that takes one
// applies the action once however many attempts reach it.
export interface ActionCall {
  readonly actionID: string;
  readonly tool: string;
  readonly arguments: JSONObject;
  readonly attempt: number;
  readonly idempotencyKey: string;
}

// What runs an action against its provider. retryDelaysMs overrides the default retry schedule.
export interface ActionConnector {
  readonly run: (call: ActionCall) => Promise<ProviderResponse>;
  readonly retryDelaysMs?: readonly number[];
}

// Why an action failed, went unknown or waits for a retry, as a code with no free text.
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

// An allowed tool call, which the tool queues as an action, under the claim of the step that made it.
export interface AllowedCall {
  readonly step: TaskClaim;
  readonly tool: string;
  readonly actionHash: string;
  readonly arguments: JSONObject;
  readonly decision: Decision;
}

// What the model sees of an action: structured input, never an instruction to act.
export type ModelView =
  | { readonly status: 'done'; readonly actionID: string; readonly result: JSONObject | null }
  | { readonly status: 'failed'; readonly actionID: string; readonly reason: string }
  | { readonly status: 'pending'; readonly actionID: string; readonly message: string }
  | { readonly status: 'unknown'; readonly actionID: string; readonly message: string };

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
}

export type ActionRow = ActionTable;

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type ActionsTables = TasksTables & Readonly<{ actions: ActionTable }>;
