import type { JSONObject } from '@heynixie/log';
import type { ToolDefinition, ToolImage } from '@heynixie/tools';

export type ProviderResponse =
  | {
      readonly kind: 'success';
      readonly result: JSONObject;

      // pictures the model reads beside the result, sealed under the outcome record's own key
      readonly images?: readonly ToolImage[];
    }
  | { readonly kind: 'refused'; readonly reason: string }
  | { readonly kind: 'refused_retryable'; readonly reason: string; readonly retryAfterMs?: number }
  | { readonly kind: 'ambiguous'; readonly reason: string }

  // The provider's own execution would send to a different set than the one the policy checked.
  | { readonly kind: 'destinations_changed'; readonly reason: string };

export interface ActionAttempt {
  readonly actionID: string;
  readonly tool: string;
  readonly arguments: JSONObject;

  // The definitions snapshot the action's first attempt ran under, or the one the queued call was
  // recorded under before an attempt has started. A connector whose declaration comes from the
  // definitions compares it with the snapshot of its own.
  readonly snapshotHash: string;

  // The version of the tool that the call was decided on. A connector whose tool has versions
  // refuses to send once the tool has another one.
  readonly pinHash?: string;

  // The snapshot that supplied the declaration the call was decided under, absent for a declaration
  // that came from no snapshot.
  readonly definitionsHash?: string;
  readonly attempt: number;
  readonly idempotencyKey: string;

  // the destinations the policy checked for the call
  readonly destinations: readonly string[];

  // the destinations among them that the message being answered named, which only that reply may reach
  readonly replyTargets?: readonly string[];

  // epoch ms when the attempt began; a check of an earlier attempt gets the time of that attempt
  readonly attemptStartedAt?: number;

  // epoch ms when the queue recorded the action, the same for every attempt and check of it
  readonly queuedAt?: number;

  // the hash the queue holds the action under, and the deadline it covers, so a connector can tell
  // which of its prepared calls the owner answered
  readonly actionHash: string;
  readonly deadlineAt: number | null;
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

// Where the action runners find the connector of a tool. A map answers it, and so does a source
// whose tools come and go, such as the MCP proxy.
export interface ConnectorLookup {
  readonly get: (tool: string) => ActionConnector | undefined;
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

// One tool of a connector. The tool endpoint leaves the tool out when a scope is missing, and the
// action queue runs `queued` for a tool that runs as an action.
export interface ConnectorAction {
  // a read's run returns a ToolOutcome, so it can carry an image or link IDs as web_fetch does
  readonly tool: ToolDefinition;

  readonly scopes: readonly string[];
  readonly reconcile: Reconcile;
  readonly queued?: ActionConnector;
}

export interface MissingScope {
  readonly scope: string;

  // `api_disabled`: the project has not enabled the scope's API, which the daily check clears
  readonly reason: 'not_granted' | 'api_disabled';
}

export interface HealthReport {
  readonly grantedScopes: readonly string[];

  readonly accountName: string | null;

  // each scope of the connector's OAuthSpec that the check found missing
  readonly missing: readonly MissingScope[];
}

// How a connector reaches its provider with OAuth. A scope is its short name: nixie adds the
// provider's prefix when it asks, and strips it from the provider's answers.
export interface OAuthSpec {
  readonly kind: 'oauth';

  // the provider's name, as the owner reads it
  readonly name: string;
  readonly authorizeURL: string;
  readonly tokenURL: string;
  readonly revokeURL: string;

  // the `iss` of the provider's ID tokens
  readonly issuer: string;

  // asked for in every consent, and kept whatever the owner unticks
  readonly identityScopes: readonly string[];

  // every consent asks for all of them
  readonly scopes: readonly string[];

  // what the provider's scope names start with, so a scope's short name leaves the prefix out
  readonly scopePrefix: string;
  readonly authorizeParams: Readonly<Record<string, string>>;

  // the origins of the connector's fetcher
  readonly origins: readonly string[];
  readonly returnPath: string;
}

export interface SetupLink {
  readonly label: string;
  readonly url: string;
}

export interface SetupStep {
  readonly id: string;
  readonly title: string;

  // `{redirectURI}` and `{origin}` are the only placeholders
  readonly body: string;
  readonly links: readonly SetupLink[];

  // the step that shows the OAuth client form
  readonly input?: 'oauth_client';
}

// What a connector's tool, attempt or check gets for one connection.
export interface ConnectorContext {
  readonly connectionID: string;

  // the short ID
  readonly connection: string;

  // the ID token's email, decrypted at each call
  readonly account: string;

  // the credential store's fetcher for this connection, limited to the connector's origins
  readonly fetch: ProviderFetch;
}

export interface ConnectionRef {
  readonly connectionID: string;
  readonly connection: string;
}

// The shape of fetch that the credential store's fetcher has: it adds the provider's credential on
// the host, so an adapter sends none.
export type ProviderFetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface Connector {
  readonly id: string;
  readonly auth: OAuthSpec | { readonly kind: 'none' };
  readonly setup: readonly SetupStep[];
  readonly actions: readonly ConnectorAction[];

  readonly check: (connection: ConnectionRef, context: ConnectorContext) => Promise<HealthReport>;
}
