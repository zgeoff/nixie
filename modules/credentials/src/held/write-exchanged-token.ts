import type { TokenReply } from './send-token-request';
import type {
  ClientGuard,
  HeldBackend,
  HeldState,
  HeldToken,
  TokenExchange,
  TokenResult,
} from './types';

export interface ExchangeWriter {
  readonly backend: HeldBackend;
  readonly now: () => number;

  // saves a state and records a change of status
  readonly writeState: (
    credentialID: string,
    previous: HeldState,
    next: HeldState,
    expectedCounter: number,
  ) => Promise<void>;

  // puts the token's values in the own-value set, unless the credential's counter has moved from
  // the one given
  readonly addOwnValues: (
    credentialID: string,
    token: HeldToken,
    expectedCounter: number,
  ) => Promise<void>;
}

export interface ExchangedTokens {
  readonly clientCredentialID: string;
  readonly request: TokenExchange;
  readonly reply: TokenReply;
  readonly account: TokenResult['account'];

  // the counter of the credential the tokens save into, read before the code went out
  readonly tokenCounter: number;

  // the OAuth client that issued the tokens, with the counter the exchange read for it
  readonly client: ClientGuard;

  // runs once the token is kept, so a caller that meets a later throw knows not to revoke it
  readonly onKept: () => void;
}

// What a write did. Only `saved` keeps the tokens: the caller revokes them on any other outcome,
// once it has let go of the slot lock, so no request to the provider holds the lock.
export type ExchangeWrite =
  | { readonly kind: 'saved'; readonly result: TokenResult }
  | { readonly kind: 'account_changed' }
  | { readonly kind: 'removed' };

// Saves the tokens of an exchange into its credential, in place of any token there. The caller
// holds the credential's slot lock, so no other save reads the slot until this one wrote it and
// deleted the key of the token it replaced.
export async function writeExchangedToken(
  writer: ExchangeWriter,
  exchanged: ExchangedTokens,
): Promise<ExchangeWrite> {
  const credentialID = exchanged.request.credentialID;

  const existing = await writer.backend.readToken(credentialID);

  if (existing !== null && hasAccountChanged(existing, exchanged.account)) {
    await writer.writeState(
      credentialID,
      existing.state,
      { ...existing.state, status: 'needs_consent', sinceMs: writer.now() },
      exchanged.tokenCounter,
    );

    return { kind: 'account_changed' };
  }

  const nowMs = writer.now();

  const keyID = await writer.backend.createKey();

  const token: HeldToken = {
    accessToken: exchanged.reply.access_token,
    refreshToken: exchanged.reply.refresh_token ?? null,
    expiresAtMs: nowMs + exchanged.reply.expires_in * 1000,
    keyID,
    clientCredentialID: exchanged.clientCredentialID,
    accountSubject: exchanged.account?.subject ?? null,
    state: {
      status: 'active',
      sinceMs: nowMs,
      lastSuccessAtMs: nowMs,
      failures: 0,
      retryAtMs: null,
    },
  };

  const written = await writer.backend.writeToken(
    credentialID,
    token,
    { expectedCounter: exchanged.tokenCounter, client: exchanged.client },
    null,
  );

  if (written === 'removed') {
    await writer.backend.removeKey(keyID);

    return { kind: 'removed' };
  }

  exchanged.onKept();

  if (existing !== null) {
    await writer.backend.removeKey(existing.keyID);
  }

  await writer.addOwnValues(credentialID, token, exchanged.tokenCounter);

  return {
    kind: 'saved',
    result: {
      credentialID,
      expiresAtMs: token.expiresAtMs,
      grantedScopes: exchanged.reply.scope === undefined ? [] : exchanged.reply.scope.split(' '),
      refreshExpiresAtMs:
        exchanged.reply.refresh_token_expires_in === undefined
          ? null
          : nowMs + exchanged.reply.refresh_token_expires_in * 1000,
      account: exchanged.account,
    },
  };
}

// A credential records the account it named at its first use. A new token that names another
// account, or none, is not the owner's reconnect of the same account.
function hasAccountChanged(existing: HeldToken, account: TokenResult['account']): boolean {
  return existing.accountSubject !== null && existing.accountSubject !== account?.subject;
}
