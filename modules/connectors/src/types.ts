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
  readonly title: string;
  readonly url: string;
  readonly snippet: string | null;

  // the date the provider gives the page, as it gives it; null when it gives none
  readonly publishedAt: string | null;
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
