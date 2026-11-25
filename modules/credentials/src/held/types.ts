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
  readonly state: HeldState;
}

export interface HeldClient {
  readonly clientSecret: string;
}

export type WriteTokenResult = 'saved' | 'removed';

// What the database backend implements: sealed values under a key of their own for each token, and
// the removal counter. The database backend itself is built apart from the store.
export interface HeldBackend {
  readonly readRemovalCounter: (credentialID: string) => Promise<number>;
  readonly readClient: (credentialID: string) => Promise<HeldClient | null>;
  readonly writeClient: (credentialID: string, client: HeldClient) => Promise<void>;
  readonly readToken: (credentialID: string) => Promise<HeldToken | null>;

  // Saves the token and its state in one transaction, and only when the credential's removal
  // counter still equals the expected one. A token that arrives after a removal is never saved.
  readonly writeToken: (
    credentialID: string,
    token: HeldToken,
    expectedCounter: number,
  ) => Promise<WriteTokenResult>;

  // changes the state of a credential that is held, and does nothing for one that is not
  readonly writeState: (credentialID: string, state: HeldState) => Promise<void>;
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
}

// What an exchange tells the caller. It holds no token.
export interface TokenResult {
  readonly credentialID: string;
  readonly expiresAtMs: number;

  // the account the ID token named, read only after its issuer, audience and expiry passed
  readonly account: {
    readonly subject: string;
    readonly email: string | null;
  } | null;
}

export type RefreshOutcome = 'saved' | 'failed' | 'needs_consent' | 'removed';
