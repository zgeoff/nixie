import type { JSONObject } from '@heynixie/log';
import type { ToolCall, ToolDefinition } from '@heynixie/tools';

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

// nixie's code for one outside service. The OAuth and static credentials arrive with the credential
// store, and setup steps, polls and the health check with the connectors that need them.
export interface Connector {
  // such as 'google'
  readonly id: string;
  readonly auth: { readonly kind: 'none' };
  readonly actions: readonly ConnectorAction[];
}
