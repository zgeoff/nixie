import type { JSONObject } from '@heynixie/log';
import type { ToolCall, ToolDefinition } from '@heynixie/tools';

// A provider's answer to one attempt, as the connector reads it: success, a refusal with no effect,
// a refusal with no effect that can clear, or a timeout, dropped connection or other ambiguity.
export type ProviderResponse =
  | { readonly kind: 'success'; readonly result: JSONObject }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'refused_retryable'; readonly reason: string; readonly retryAfterMs?: number }
  | { readonly kind: 'ambiguous'; readonly reason: string };

// One attempt of an action. The action ID is the idempotency key, so a provider that takes one
// applies the action once however many attempts reach it.
export interface ActionAttempt {
  readonly actionID: string;
  readonly tool: string;
  readonly arguments: JSONObject;
  readonly attempt: number;
  readonly idempotencyKey: string;
}

// What the action queue runs an action's attempts against its provider with. retryDelaysMs
// overrides the default retry schedule.
export interface ActionConnector {
  readonly run: (attempt: ActionAttempt) => Promise<ProviderResponse>;
  readonly retryDelaysMs?: readonly number[];
}

// How the action queue reconciles an action whose outcome is unknown: the provider's idempotency
// key and how long the provider keeps it, a read-only check and how long to wait before trusting a
// negative answer, or neither.
export type Reconcile =
  | { readonly kind: 'idempotency_key'; readonly where: string; readonly keptFor: string }
  | { readonly kind: 'check'; readonly action: string; readonly settleAfter: string }
  | { readonly kind: 'none' };

// A provider's answer, as the connector maps it. refused and retry had no effect, retry may clear,
// and ambiguous means the action may have happened.
export type ActionResponse =
  | { readonly kind: 'done'; readonly result: JSONObject }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'retry'; readonly reason: string; readonly after?: string }
  | { readonly kind: 'ambiguous'; readonly reason: string };

// One call of an action. A queued action's ID is its idempotency key, or the value its check finds.
export interface ActionCall {
  readonly call: ToolCall;
  readonly actionID: string | null;
}

// One action of a connector, which becomes one of nixie's tools.
export interface ConnectorAction {
  readonly tool: Omit<ToolDefinition, 'run'>;

  // the provider scopes the action needs
  readonly scopes: readonly string[];
  readonly reconcile: Reconcile;
  readonly run: (call: ActionCall) => Promise<ActionResponse>;
}

// What a connector's check found on one connection.
export interface HealthReport {
  // the provider scopes the connection's credential holds
  readonly grantedScopes: readonly string[];

  // the account the credential reaches as the provider names it, such as an email address, or null
  // when the provider names none
  readonly accountName: string | null;
}

// nixie's code for one outside service. The OAuth and static credentials arrive with the credential
// store, and with it the check's fetcher for the connection's credential. Setup steps and polls
// arrive with the connectors that need them.
export interface Connector {
  // such as 'google'
  readonly id: string;
  readonly auth: { readonly kind: 'none' };
  readonly actions: readonly ConnectorAction[];

  // makes one read call per scope, and runs when a connection is set up
  readonly check: () => Promise<HealthReport>;
}
