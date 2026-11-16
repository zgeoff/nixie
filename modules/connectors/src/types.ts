import type { JSONObject } from '@heynixie/log';
import type { ToolCall, ToolDefinition } from '@heynixie/tools';

export type ProviderResponse =
  | { readonly kind: 'success'; readonly result: JSONObject }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'refused_retryable'; readonly reason: string; readonly retryAfterMs?: number }
  | { readonly kind: 'ambiguous'; readonly reason: string }

  // The provider's own execution would send to a different set than the one the policy checked.
  | { readonly kind: 'destinations_changed'; readonly reason: string };

export interface ActionAttempt {
  readonly actionID: string;
  readonly tool: string;
  readonly arguments: JSONObject;
  readonly attempt: number;
  readonly idempotencyKey: string;

  // the destinations the policy checked for the call
  readonly destinations: readonly string[];
}

// What a read-only check of the provider found.
export type CheckResponse =
  | { readonly kind: 'found'; readonly result: JSONObject }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'inconclusive' };

export interface ActionConnector {
  readonly run: (attempt: ActionAttempt) => Promise<ProviderResponse>;
  readonly retryDelaysMs?: readonly number[];

  // how an action of this connector whose outcome is unknown is settled; none when absent
  readonly reconcile?: Reconcile;

  // Reads the provider and never writes to it. A connector that declares a check has it.
  readonly check?: (attempt: ActionAttempt) => Promise<CheckResponse>;
}

// How a connector action settles an unknown outcome: a retry under the provider's idempotency key, a
// read-only check, or none, which asks the owner. A not-found check counts after trustNegativeAfterMs.
export type Reconcile =
  | { readonly kind: 'idempotency_key'; readonly where: string; readonly keptForMs: number }
  | {
      readonly kind: 'check';
      readonly tool: string;
      readonly trustNegativeAfterMs?: number;
      readonly onNotFound?: 'retry' | 'ask';
    }
  | { readonly kind: 'none' };

export const defaultTrustNegativeAfterMs = 60_000;

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

export type SearchFreshness = 'day' | 'week' | 'month';

export interface SearchRequest {
  readonly query: string;
  readonly limit: number;

  // the domains a hit must come from; empty for any domain
  readonly sites: readonly string[];

  // how recently a hit's page was published or updated; null for any time
  readonly freshness: SearchFreshness | null;
}

export interface SearchHit {
  // plain text, with no markup
  readonly title: string;
  readonly url: string;

  // plain text, with no markup
  readonly snippet: string | null;

  // the day the provider says the page was created or last updated, such as 2026-11-06; null when
  // it gives none
  readonly date: string | null;
}

export type SearchReply =
  | { readonly kind: 'hits'; readonly hits: readonly SearchHit[]; readonly costUSD: number }
  | { readonly kind: 'failed'; readonly reason: string };

export interface SearchProvider {
  readonly readHits: (request: SearchRequest) => Promise<SearchReply>;
}

export interface Connector {
  readonly id: string;
  readonly auth: { readonly kind: 'none' };
  readonly actions: readonly ConnectorAction[];

  readonly check: () => Promise<HealthReport>;
}
