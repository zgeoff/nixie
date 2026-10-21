import type { JSONObject } from '@heynixie/log';
import type { ToolCall, ToolDefinition } from '@heynixie/tools';

export type ProviderResponse =
  | { readonly kind: 'success'; readonly result: JSONObject }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'refused_retryable'; readonly reason: string; readonly retryAfterMs?: number }
  | { readonly kind: 'ambiguous'; readonly reason: string };

export interface ActionAttempt {
  readonly actionID: string;
  readonly tool: string;
  readonly arguments: JSONObject;
  readonly attempt: number;
  readonly idempotencyKey: string;
}

export interface ActionConnector {
  readonly run: (attempt: ActionAttempt) => Promise<ProviderResponse>;
  readonly retryDelaysMs?: readonly number[];
}

export type Reconcile =
  | { readonly kind: 'idempotency_key'; readonly where: string; readonly keptFor: string }
  | { readonly kind: 'check'; readonly action: string; readonly settleAfter: string }
  | { readonly kind: 'none' };

export type ActionResponse =
  | { readonly kind: 'done'; readonly result: JSONObject }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'retry'; readonly reason: string; readonly after?: string }
  | { readonly kind: 'ambiguous'; readonly reason: string };

export interface ActionCall {
  readonly call: ToolCall;
  readonly actionID: string | null;
}

export interface ConnectorAction {
  readonly tool: Omit<ToolDefinition, 'run'>;

  readonly scopes: readonly string[];
  readonly reconcile: Reconcile;
  readonly run: (call: ActionCall) => Promise<ActionResponse>;
}

export interface HealthReport {
  readonly grantedScopes: readonly string[];

  readonly accountName: string | null;
}

export interface Connector {
  readonly id: string;
  readonly auth: { readonly kind: 'none' };
  readonly actions: readonly ConnectorAction[];

  readonly check: () => Promise<HealthReport>;
}
