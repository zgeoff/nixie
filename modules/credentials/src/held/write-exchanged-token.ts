import { CredentialRemovedError } from './credential-removed-error';
import type { TokenReply } from './send-token-request';
import { TokenRequestError } from './token-request-error';
import type { HeldBackend, HeldState, HeldToken, TokenExchange, TokenResult } from './types';

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

  // puts the token's values in the own-value set
  readonly addOwnValues: (credentialID: string, token: HeldToken) => void;
}

export interface ExchangedTokens {
  readonly client: { readonly credentialID: string; readonly label: string };
  readonly request: TokenExchange;
  readonly reply: TokenReply;
  readonly account: TokenResult['account'];

  // the counter of the credential the tokens save into, read before the code went out
  readonly tokenCounter: number;

  // revokes the tokens the exchange received
  readonly dropTokens: () => Promise<void>;
}

// Saves the tokens of an exchange into its credential, in place of any token there. The caller
// holds the credential's slot lock, so no other save reads the slot until this one wrote it and
// deleted the key of the token it replaced.
export async function writeExchangedToken(
  writer: ExchangeWriter,
  exchanged: ExchangedTokens,
): Promise<TokenResult> {
  const credentialID = exchanged.request.credentialID;

  const existing = await writer.backend.readToken(credentialID);

  if (existing !== null && hasAccountChanged(existing, exchanged.account)) {
    await exchanged.dropTokens();

    await writer.writeState(
      credentialID,
      existing.state,
      { ...existing.state, status: 'needs_consent', sinceMs: writer.now() },
      exchanged.tokenCounter,
    );

    throw new TokenRequestError('account_changed');
  }

  const nowMs = writer.now();

  const keyID = await writer.backend.createKey();

  const token: HeldToken = {
    accessToken: exchanged.reply.access_token,
    refreshToken: exchanged.reply.refresh_token ?? null,
    expiresAtMs: nowMs + exchanged.reply.expires_in * 1000,
    keyID,
    clientCredentialID: exchanged.client.credentialID,
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
    exchanged.tokenCounter,
    null,
  );

  if (written === 'removed') {
    await exchanged.dropTokens();
    await writer.backend.removeKey(keyID);

    throw new CredentialRemovedError(exchanged.client.label);
  }

  if (existing !== null) {
    await writer.backend.removeKey(existing.keyID);
  }

  writer.addOwnValues(credentialID, token);

  return { credentialID, expiresAtMs: token.expiresAtMs, account: exchanged.account };
}

// A credential records the account it named at its first use. A new token that names another
// account, or none, is not the owner's reconnect of the same account.
function hasAccountChanged(existing: HeldToken, account: TokenResult['account']): boolean {
  return existing.accountSubject !== null && existing.accountSubject !== account?.subject;
}
