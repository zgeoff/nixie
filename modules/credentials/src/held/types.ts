export type CredentialStatus = 'active' | 'failing' | 'needs_consent';

export type FailingReason = 'unauthorised' | 'service_error' | 'no_answer';

export interface HeldState {
  readonly status: CredentialStatus;

  // only while the status is `failing`
  readonly reason?: FailingReason;
  readonly sinceMs: number;
  readonly lastSuccessAtMs: number | null;

  // failed refreshes in a row
  readonly failures: number;

  // the earliest time the next timed refresh may send, after failures
  readonly retryAtMs: number | null;
}

export interface HeldToken {
  readonly accessToken: string;
  readonly refreshToken: string | null;
  readonly expiresAtMs: number;

  // the key the token is sealed under, a random UUID
  readonly keyID: string;

  // the OAuth client that issued the token
  readonly clientCredentialID: string;

  // the `sub` of the account the ID token named at the credential's first use, or null when no
  // token named one
  readonly accountSubject: string | null;
  readonly state: HeldState;
}

export interface HeldClient {
  // the OAuth client's public ID, which is no secret
  readonly clientID: string;

  // empty for a public client, which sends none
  readonly clientSecret: string;

  // The connector that owns the client's row, such as `mcp`. A client with none belongs to Google.
  readonly connectorID?: string;
}

export type WriteTokenResult = 'saved' | 'removed';

// The OAuth client that issued a token, and the removal counter the caller read for it. A token
// write checks it in the write transaction, so a client removed after the caller's last check never
// gets a token saved.
export interface ClientGuard {
  readonly credentialID: string;
  readonly expectedCounter: number;
}

// What a token write checks in its transaction: the token credential's removal counter, and its
// client's.
export interface TokenGuard {
  readonly expectedCounter: number;
  readonly client: ClientGuard;
}

// What a revocation needs of a token that a removal already refuses to every other reader.
export interface RevocableToken {
  readonly refreshToken: string | null;
  readonly accessToken: string;
  readonly clientCredentialID: string;
}

export type RevokeOutcome = 'confirmed' | 'refused' | 'unknown' | 'not_attempted';

// What one revocation at the provider came to: the HTTP status, and the provider's error code when
// it is one of a fixed set, never free text.
export interface RevokeResult {
  readonly outcome: RevokeOutcome;
  readonly status: number | null;
  readonly providerError: string | null;
}

// What the database backend implements: sealed values under a key of their own for each token, and
// the removal counter. The database backend itself is built apart from the store.
export interface HeldBackend {
  readonly readRemovalCounter: (credentialID: string) => Promise<number>;
  readonly readClient: (credentialID: string) => Promise<HeldClient | null>;
  readonly writeClient: (credentialID: string, client: HeldClient) => Promise<void>;
  readonly readToken: (credentialID: string) => Promise<HeldToken | null>;

  // Saves the token and its state, and the record when one is given, in one transaction, and only
  // when the credential's removal counter and its client's still equal the expected ones. A crash
  // leaves both or neither, so a start never finds a saved token whose refresh reads as lost.
  readonly writeToken: (
    credentialID: string,
    token: HeldToken,
    guard: TokenGuard,
    record: CredentialEvent | null,
  ) => Promise<WriteTokenResult>;

  // The token of a credential whose removal began and whose key has not gone yet, which only a
  // revocation reads. Null once the key is gone, such as after a restore.
  readonly readTokenForRevocation: (credentialID: string) => Promise<RevocableToken | null>;

  // Changes the state of a credential that is held, only when its removal counter still equals the
  // expected one, and does nothing for one that is not held.
  readonly writeState: (
    credentialID: string,
    state: HeldState,
    expectedCounter: number,
  ) => Promise<WriteTokenResult>;
  readonly createKey: () => Promise<string>;
  readonly removeKey: (keyID: string) => Promise<void>;

  // Removes the credential's rows and advances its removal counter in one transaction, and returns
  // the new counter.
  readonly remove: (credentialID: string) => Promise<number>;
}

export type CredentialEvent =
  | {
      readonly event: 'refresh_started';
      readonly credentialID: string;
      readonly attemptID: string;
      readonly newKeyID: string;
      readonly removalCounter: number;
    }
  | {
      readonly event: 'refresh_saved';
      readonly credentialID: string;
      readonly attemptID: string;
      readonly fingerprint: string;
    }
  | {
      readonly event: 'refresh_failed';
      readonly credentialID: string;
      readonly attemptID: string;
      readonly outcome: 'refused' | 'service_error' | 'no_answer';
    }
  | {
      readonly event: 'refresh_discarded';
      readonly credentialID: string;
      readonly attemptID: string;
      readonly isRevoked: boolean;
    }
  | {
      readonly event: 'refresh_lost';
      readonly credentialID: string;
      readonly attemptID: string;
    }
  | {
      readonly event: 'status_changed';
      readonly credentialID: string;
      readonly status: CredentialStatus;
      readonly reason?: FailingReason;
    };

export interface OpenRefresh {
  readonly credentialID: string;
  readonly attemptID: string;
  readonly newKeyID: string;

  // null for a refresh that an older record began
  readonly removalCounter: number | null;
}

export interface CredentialRecorder {
  readonly write: (event: CredentialEvent) => Promise<void>;

  // the refreshes that the log shows as started and never closed
  readonly readOpenRefreshes: () => Promise<readonly OpenRefresh[]>;
}

export interface TokenExchange {
  readonly code: string;
  readonly redirectURI: string;
  readonly codeVerifier?: string;

  // the credential the tokens are saved under: a random UUID the caller made
  readonly credentialID: string;

  // Asked before the exchange revokes a token it will not keep, with the `sub` of the account the
  // ID token named, or null when it named none. Answers false when the grant is still in use.
  readonly probeRevocable?: (subject: string | null) => Promise<boolean>;
}

// What an exchange tells the caller. It holds no token.
export interface TokenResult {
  readonly credentialID: string;
  readonly expiresAtMs: number;

  // the scopes the provider says it granted, as it wrote them; empty when it names none
  readonly grantedScopes: readonly string[];

  // when a grant of limited time ends, from the provider's refresh_token_expires_in; null otherwise
  readonly refreshExpiresAtMs: number | null;

  // the account the ID token named, read only after its issuer, audience and expiry passed
  readonly account: {
    readonly subject: string;
    readonly email: string | null;
  } | null;
}

export type RefreshOutcome = 'saved' | 'failed' | 'needs_consent' | 'removed';
