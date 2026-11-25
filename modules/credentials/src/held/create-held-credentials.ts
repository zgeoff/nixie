import { CredentialRefusalError } from '@heynixie/egress';
import { planBackoffDelay } from '@heynixie/retry';
import { readFingerprint } from '../fingerprint/read-fingerprint';
import type { OwnValueSet } from '../own-values/create-own-value-set';
import type { CredentialFetch, OAuthProvider } from '../types';
import { CredentialRemovedError } from './credential-removed-error';
import { parseIDToken } from './parse-id-token';
import { recoverLostRefreshes } from './recover-lost-refreshes';
import { sendTokenRequest } from './send-token-request';
import type { TokenReply } from './send-token-request';
import { TokenRequestError } from './token-request-error';
import type {
  CredentialRecorder,
  FailingReason,
  HeldBackend,
  HeldState,
  HeldToken,
  RefreshOutcome,
  TokenExchange,
  TokenResult,
} from './types';

export interface HeldOptions {
  readonly backend: HeldBackend;
  readonly recorder: CredentialRecorder;
  readonly fingerprintKey: CryptoKey;
  readonly ownValues: OwnValueSet;
  readonly now: () => number;

  // a fetcher for the provider's origin, with these values cut from what it returns
  readonly makeProviderFetch: (
    provider: OAuthProvider,
    bodyValues: readonly string[],
  ) => CredentialFetch;
}

// A binding of the database backend, with what the provider calls need from its spec.
export interface HeldHandle {
  readonly credentialID: string;
  readonly removalCounter: number;
  readonly label: string;
  readonly provider: OAuthProvider;
}

export interface HeldCredentials {
  readonly readCounter: (credentialID: string) => Promise<number>;
  readonly checkCounter: (
    handle: Pick<HeldHandle, 'credentialID' | 'removalCounter' | 'label'>,
  ) => Promise<void>;
  readonly exchange: (client: HeldHandle, request: TokenExchange) => Promise<TokenResult>;
  readonly refresh: (handle: HeldHandle) => Promise<RefreshOutcome>;
  readonly refreshIfDue: (handle: HeldHandle) => Promise<RefreshOutcome | null>;
  readonly readAccessToken: (handle: HeldHandle) => Promise<string>;
  readonly markFailing: (handle: HeldHandle, reason: FailingReason) => Promise<void>;
  readonly readState: (credentialID: string) => Promise<HeldState | null>;
  readonly remove: (credentialID: string) => Promise<void>;
  readonly recover: () => Promise<void>;
}

interface FailureInput {
  readonly token: HeldToken;
  readonly attemptID: string;
  readonly kind: 'refused' | 'service_error' | 'no_answer';
}

export function createHeldCredentials(options: HeldOptions): HeldCredentials {
  const backend = options.backend;

  const inFlight = new Map<string, Promise<RefreshOutcome>>();

  const checkCounter: HeldCredentials['checkCounter'] = async (handle) => {
    const current = await backend.readRemovalCounter(handle.credentialID);

    if (current !== handle.removalCounter) {
      throw new CredentialRemovedError(handle.label);
    }
  };

  const addOwnValues = (credentialID: string, token: HeldToken): void => {
    options.ownValues.add({
      group: 'connector_credentials',
      name: `held:${credentialID}:access`,
      value: token.accessToken,
    });

    if (token.refreshToken !== null) {
      options.ownValues.add({
        group: 'connector_credentials',
        name: `held:${credentialID}:refresh`,
        value: token.refreshToken,
      });
    }
  };

  const writeState = async (
    credentialID: string,
    previous: HeldState,
    next: HeldState,
  ): Promise<void> => {
    await backend.writeState(credentialID, next);

    if (previous.status !== next.status || previous.reason !== next.reason) {
      await options.recorder.write({
        event: 'status_changed',
        credentialID,
        status: next.status,
        ...(next.reason === undefined ? {} : { reason: next.reason }),
      });
    }
  };

  // A token that arrived after a removal is revoked at the provider before it is dropped. This
  // call skips the counter check, which would refuse it.
  const revoke = async (
    handle: Pick<HeldHandle, 'provider'>,
    clientSecret: string,
    token: string,
  ): Promise<boolean> => {
    if (handle.provider.revokeURL === undefined) {
      return false;
    }

    const send = options.makeProviderFetch(handle.provider, [clientSecret]);

    try {
      const response = await send(handle.provider.revokeURL, {
        method: 'POST',
        body: new URLSearchParams({
          token,
          client_id: handle.provider.clientID,
          client_secret: clientSecret,
        }),
      });

      return response.ok;
    } catch {
      return false;
    }
  };

  const runRefresh = async (handle: HeldHandle): Promise<RefreshOutcome> => {
    await checkCounter(handle);

    const token = await backend.readToken(handle.credentialID);

    if (token === null) {
      return 'removed';
    }

    const client = await backend.readClient(token.clientCredentialID);

    if (token.refreshToken === null || client === null) {
      await writeState(handle.credentialID, token.state, {
        ...token.state,
        status: 'needs_consent',
        sinceMs: options.now(),
      });

      return 'needs_consent';
    }

    const attemptID = crypto.randomUUID();

    const newKeyID = await backend.createKey();

    await options.recorder.write({
      event: 'refresh_started',
      credentialID: handle.credentialID,
      attemptID,
      newKeyID,
    });

    const send = options.makeProviderFetch(handle.provider, [client.clientSecret]);

    const result = await sendTokenRequest(send, handle.provider.tokenURL, {
      grant_type: 'refresh_token',
      refresh_token: token.refreshToken,
      client_id: handle.provider.clientID,
      client_secret: client.clientSecret,
    });

    if (result.kind !== 'tokens') {
      await backend.removeKey(newKeyID);

      return writeFailure(handle, { token, attemptID, kind: result.kind });
    }

    const nowMs = options.now();

    const renewed: HeldToken = {
      accessToken: result.reply.access_token,
      refreshToken: result.reply.refresh_token ?? token.refreshToken,
      expiresAtMs: nowMs + result.reply.expires_in * 1000,
      keyID: newKeyID,
      clientCredentialID: token.clientCredentialID,
      state: {
        status: 'active',
        sinceMs: token.state.status === 'active' ? token.state.sinceMs : nowMs,
        lastSuccessAtMs: nowMs,
        failures: 0,
        retryAtMs: null,
      },
    };

    const written = await backend.writeToken(handle.credentialID, renewed, handle.removalCounter);

    if (written === 'removed') {
      const isRevoked = await revoke(
        handle,
        client.clientSecret,
        renewed.refreshToken ?? renewed.accessToken,
      );

      await backend.removeKey(newKeyID);

      await options.recorder.write({
        event: 'refresh_discarded',
        credentialID: handle.credentialID,
        attemptID,
        isRevoked,
      });

      return 'removed';
    }

    addOwnValues(handle.credentialID, renewed);

    await options.recorder.write({
      event: 'refresh_saved',
      credentialID: handle.credentialID,
      attemptID,
      fingerprint: await readFingerprint(renewed.accessToken, options.fingerprintKey),
    });

    if (token.keyID !== newKeyID) {
      await backend.removeKey(token.keyID);
    }

    if (token.state.status !== 'active') {
      await options.recorder.write({
        event: 'status_changed',
        credentialID: handle.credentialID,
        status: 'active',
      });
    }

    return 'saved';
  };

  const writeFailure = async (
    handle: HeldHandle,
    failure: FailureInput,
  ): Promise<RefreshOutcome> => {
    const nowMs = options.now();
    const next = pickFailureState(failure.token.state, failure.kind, nowMs);

    await options.recorder.write({
      event: 'refresh_failed',
      credentialID: handle.credentialID,
      attemptID: failure.attemptID,
      outcome: failure.kind,
    });

    await writeState(handle.credentialID, failure.token.state, next);

    return next.status === 'needs_consent' ? 'needs_consent' : 'failed';
  };

  const runGuarded = async (handle: HeldHandle): Promise<RefreshOutcome> => {
    try {
      return await runRefresh(handle);
    } finally {
      inFlight.delete(handle.credentialID);
    }
  };

  const refresh: HeldCredentials['refresh'] = (handle) => {
    const running = inFlight.get(handle.credentialID);

    if (running !== undefined) {
      return running;
    }

    const started = runGuarded(handle);

    inFlight.set(handle.credentialID, started);

    return started;
  };

  const refreshIfDue: HeldCredentials['refreshIfDue'] = async (handle) => {
    const token = await backend.readToken(handle.credentialID);

    if (
      token === null ||
      token.refreshToken === null ||
      token.state.status === 'needs_consent' ||
      !isDue(token, options.now())
    ) {
      return null;
    }

    return refresh(handle);
  };

  return {
    readCounter: backend.readRemovalCounter,
    checkCounter,
    refresh,
    refreshIfDue,
    exchange: async (client, request) => {
      await checkCounter(client);

      const secret = await backend.readClient(client.credentialID);

      if (secret === null) {
        throw new CredentialRefusalError(`the credential ${client.label} holds no client secret`);
      }

      const tokenCounter = await backend.readRemovalCounter(request.credentialID);

      const send = options.makeProviderFetch(client.provider, [secret.clientSecret]);

      const result = await sendTokenRequest(send, client.provider.tokenURL, {
        grant_type: 'authorization_code',
        code: request.code,
        redirect_uri: request.redirectURI,
        client_id: client.provider.clientID,
        client_secret: secret.clientSecret,
        ...(request.codeVerifier === undefined ? {} : { code_verifier: request.codeVerifier }),
      });

      if (result.kind !== 'tokens') {
        throw new TokenRequestError(result.kind);
      }

      const dropTokens = async (): Promise<void> => {
        await revoke(client, secret.clientSecret, pickRevocable(result.reply));
      };

      const account = await readAccount(result.reply, client.provider, options.now(), dropTokens);

      try {
        await checkCounter(client);
      } catch (error) {
        await dropTokens();

        throw error;
      }

      const nowMs = options.now();

      const keyID = await backend.createKey();

      const token: HeldToken = {
        accessToken: result.reply.access_token,
        refreshToken: result.reply.refresh_token ?? null,
        expiresAtMs: nowMs + result.reply.expires_in * 1000,
        keyID,
        clientCredentialID: client.credentialID,
        state: {
          status: 'active',
          sinceMs: nowMs,
          lastSuccessAtMs: nowMs,
          failures: 0,
          retryAtMs: null,
        },
      };

      const written = await backend.writeToken(request.credentialID, token, tokenCounter);

      if (written === 'removed') {
        await dropTokens();

        await backend.removeKey(keyID);

        throw new CredentialRemovedError(client.label);
      }

      addOwnValues(request.credentialID, token);

      return {
        credentialID: request.credentialID,
        expiresAtMs: token.expiresAtMs,
        account,
      };
    },
    readAccessToken: async (handle) => {
      await checkCounter(handle);
      await refreshIfDue(handle);

      const token = await backend.readToken(handle.credentialID);

      if (token === null) {
        throw new CredentialRemovedError(handle.label);
      }

      if (token.state.status === 'needs_consent') {
        throw new CredentialRefusalError(
          `the credential ${handle.label} needs the owner's consent`,
        );
      }

      return token.accessToken;
    },
    markFailing: async (handle, reason) => {
      const token = await backend.readToken(handle.credentialID);

      if (token === null) {
        return;
      }

      await writeState(handle.credentialID, token.state, {
        ...token.state,
        status: 'failing',
        reason,
        sinceMs: options.now(),
      });
    },
    readState: async (credentialID) => {
      const token = await backend.readToken(credentialID);

      return token?.state ?? null;
    },
    remove: async (credentialID) => {
      await backend.remove(credentialID);

      options.ownValues.remove('connector_credentials', `held:${credentialID}:access`);
      options.ownValues.remove('connector_credentials', `held:${credentialID}:refresh`);
    },
    recover: () =>
      recoverLostRefreshes({
        backend,
        recorder: options.recorder,
        now: options.now,
        writeState,
      }),
  };
}

const failuresBeforeFailing = 3;

// The pause after a failed refresh, which web fetch's host backoff also uses.
const retryBackoff = { firstMs: 30_000, maxMs: 300_000 } as const;

// The state after a refresh that gave no token. A refusal for good needs the owner. Three failures
// in a row mark the credential failing, and every failure pushes the next timed refresh back.
function pickFailureState(
  previous: HeldState,
  kind: FailureInput['kind'],
  nowMs: number,
): HeldState {
  const failures = previous.failures + 1;
  const retryAtMs = nowMs + planBackoffDelay(failures, retryBackoff);

  if (kind === 'refused') {
    return {
      ...previous,
      status: 'needs_consent',
      sinceMs: nowMs,
      failures,
      retryAtMs,
    };
  }

  if (failures >= failuresBeforeFailing) {
    return {
      ...previous,
      status: 'failing',
      reason: kind,
      sinceMs: nowMs,
      failures,
      retryAtMs,
    };
  }

  return { ...previous, failures, retryAtMs };
}

// The refresh timings: a token refreshes 5 minutes before it expires, and at least every 7 days.
const refreshLeadMs = 5 * 60 * 1000;
const refreshEveryMs = 7 * 24 * 60 * 60 * 1000;

function isDue(token: HeldToken, nowMs: number): boolean {
  if (token.state.retryAtMs !== null && nowMs < token.state.retryAtMs) {
    return false;
  }

  const lastSuccessAtMs = token.state.lastSuccessAtMs ?? 0;

  return token.expiresAtMs - nowMs <= refreshLeadMs || nowMs - lastSuccessAtMs >= refreshEveryMs;
}

function pickRevocable(reply: TokenReply): string {
  return reply.refresh_token ?? reply.access_token;
}

async function readAccount(
  reply: TokenReply,
  provider: OAuthProvider,
  nowMs: number,
  dropTokens: () => Promise<void>,
): Promise<TokenResult['account']> {
  if (reply.id_token === undefined) {
    return null;
  }

  const parsed = parseIDToken(reply.id_token, {
    issuer: provider.issuer,
    audience: provider.clientID,
    nowMs,
  });

  if (!parsed.isValid) {
    await dropTokens();

    throw new TokenRequestError(parsed.code);
  }

  return { subject: parsed.subject, email: parsed.email };
}
