import { CredentialRefusalError } from '@heynixie/egress';
import { match } from 'ts-pattern';
import { readFingerprint } from '../fingerprint/read-fingerprint';
import type { OwnValueSet } from '../own-values/create-own-value-set';
import type { CredentialFetch, OAuthProvider } from '../types';
import { createKeyedLock } from './create-keyed-lock';
import { CredentialRemovedError } from './credential-removed-error';
import { isDue } from './is-due';
import { pickFailureState } from './pick-failure-state';
import type { RefreshFailureKind } from './pick-failure-state';
import { pickRevocable } from './pick-revocable';
import { readAccount } from './read-account';
import { recoverLostRefreshes } from './recover-lost-refreshes';
import { sendRevocation } from './send-revocation';
import { pickProviderError, sendTokenRequest } from './send-token-request';
import { TokenRequestError } from './token-request-error';
import type {
  CredentialRecorder,
  FailingReason,
  HeldBackend,
  HeldState,
  HeldToken,
  RefreshOutcome,
  RevokeResult,
  TokenExchange,
  TokenResult,
} from './types';
import { writeExchangedToken } from './write-exchanged-token';

export interface HeldOptions {
  readonly backend: HeldBackend;
  readonly recorder: CredentialRecorder;
  readonly fingerprintKey: CryptoKey;
  readonly ownValues: OwnValueSet;
  readonly now: () => number;

  // how long a request to the provider's token or revoke endpoint may take, in ms
  readonly requestTimeoutMs: number;

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

interface TrackedRequest {
  readonly signal: AbortSignal;
  readonly end: () => void;
}

type CounterHandle = Pick<HeldHandle, 'credentialID' | 'removalCounter' | 'label'>;

export interface HeldCredentials {
  readonly readCounter: (credentialID: string) => Promise<number>;
  readonly checkCounter: (handle: CounterHandle) => Promise<void>;

  // Checks the counter and runs `start` under the credential's lock, which a removal takes too, so
  // no removal lands between the check and the send that `start` hands off.
  readonly withSendCheck: <T>(handle: CounterHandle, start: () => T) => Promise<T>;
  readonly exchange: (client: HeldHandle, request: TokenExchange) => Promise<TokenResult>;
  readonly refresh: (handle: HeldHandle) => Promise<RefreshOutcome>;
  readonly refreshIfDue: (handle: HeldHandle) => Promise<RefreshOutcome | null>;

  // refreshes first when the token is due
  readonly readAccessToken: (handle: HeldHandle) => Promise<string>;

  // the token as saved, with no refresh: the retry after a forced refresh reads it, so a short
  // lived token never starts a second refresh
  readonly readCurrentToken: (handle: HeldHandle) => Promise<string>;
  readonly markFailing: (handle: HeldHandle, reason: FailingReason) => Promise<void>;

  // Registers a request in flight on the credential. A removal aborts its signal.
  readonly trackRequest: (credentialID: string) => TrackedRequest;

  // Sends the credential's refresh token to the provider's revoke URL once, and says how it ended.
  // It reads the token that a removal began, which every other path refuses.
  readonly revoke: (handle: HeldHandle) => Promise<RevokeResult>;
  readonly readState: (handle: CounterHandle) => Promise<HeldState | null>;
  readonly remove: (credentialID: string) => Promise<void>;
  readonly moveOwnValues: (fromCredentialID: string, toCredentialID: string) => Promise<void>;
  readonly recover: () => Promise<void>;
}

interface FailureInput {
  readonly token: HeldToken;
  readonly attemptID: string;
  readonly kind: RefreshFailureKind;
}

export function createHeldCredentials(options: HeldOptions): HeldCredentials {
  const backend = options.backend;

  const inFlight = new Map<string, Promise<RefreshOutcome>>();
  const requests = new Map<string, Set<AbortController>>();

  // A removal and the check before a send take this lock, so a send never starts after a removal
  // its check missed.
  const removalLock = createKeyedLock();

  // Each read of a credential's token that leads to a write of it holds this lock until the write
  // and the delete of the key it replaced, so two saves never both find the same token.
  const slotLock = createKeyedLock();

  const checkCounter: HeldCredentials['checkCounter'] = async (handle) => {
    const current = await backend.readRemovalCounter(handle.credentialID);

    if (current !== handle.removalCounter) {
      throw new CredentialRemovedError(handle.label);
    }
  };

  const addOwnValues = (credentialID: string, token: HeldToken): void => {
    if (token.accessToken !== '') {
      options.ownValues.add({
        group: 'connector_credentials',
        name: `held:${credentialID}:access`,
        value: token.accessToken,
      });
    }

    if (token.refreshToken !== null) {
      options.ownValues.add({
        group: 'connector_credentials',
        name: `held:${credentialID}:refresh`,
        value: token.refreshToken,
      });
    }
  };

  // A removal clears the values under the removal lock, so a value added under that lock after a
  // counter check either meets the clear or finds the counter moved.
  const addCurrentOwnValues = (
    credentialID: string,
    token: HeldToken,
    expectedCounter: number,
  ): Promise<void> =>
    removalLock.withLock(credentialID, async () => {
      const current = await backend.readRemovalCounter(credentialID);

      if (current === expectedCounter) {
        addOwnValues(credentialID, token);
      }
    });

  const writeState = async (
    credentialID: string,
    previous: HeldState,
    next: HeldState,
    expectedCounter: number,
  ): Promise<void> => {
    const written = await backend.writeState(credentialID, next, expectedCounter);

    if (written === 'removed') {
      return;
    }

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
    const result = await sendRevocation(options, handle.provider, clientSecret, token);

    return result.outcome === 'confirmed';
  };

  const runRefresh = async (handle: HeldHandle): Promise<RefreshOutcome> => {
    const token = await backend.readToken(handle.credentialID);

    // The counter only grows, so a counter that still matches after the read means the token is of
    // this handle's generation.
    await checkCounter(handle);

    if (token === null) {
      return 'removed';
    }

    const clientCounter = await backend.readRemovalCounter(token.clientCredentialID);
    const client = await backend.readClient(token.clientCredentialID);

    if (token.refreshToken === null || client === null) {
      await writeState(
        handle.credentialID,
        token.state,
        { ...token.state, status: 'needs_consent', sinceMs: options.now() },
        handle.removalCounter,
      );

      return 'needs_consent';
    }

    const attemptID = crypto.randomUUID();

    const newKeyID = await backend.createKey();

    await options.recorder.write({
      event: 'refresh_started',
      credentialID: handle.credentialID,
      attemptID,
      newKeyID,
      removalCounter: handle.removalCounter,
    });

    const send = options.makeProviderFetch(handle.provider, [client.clientSecret]);

    const result = await sendTokenRequest(
      send,
      handle.provider.tokenURL,
      {
        grant_type: 'refresh_token',
        refresh_token: token.refreshToken,
        client_id: handle.provider.clientID,
        client_secret: client.clientSecret,
      },
      options.requestTimeoutMs,
    );

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
      accountSubject: token.accountSubject,
      state: {
        status: 'active',
        sinceMs: token.state.status === 'active' ? token.state.sinceMs : nowMs,
        lastSuccessAtMs: nowMs,
        failures: 0,
        retryAtMs: null,
      },
    };

    const fingerprint = await readFingerprint(renewed.accessToken, options.fingerprintKey);

    const written = await slotLock.withLock(handle.credentialID, async () => {
      // An exchange may have replaced the token since the refresh read it, so the key to delete is
      // the one of the token this write replaces.
      const replaced = await backend.readToken(handle.credentialID);

      const outcome = await backend.writeToken(
        handle.credentialID,
        renewed,
        {
          expectedCounter: handle.removalCounter,
          client: { credentialID: token.clientCredentialID, expectedCounter: clientCounter },
        },
        {
          event: 'refresh_saved',
          credentialID: handle.credentialID,
          attemptID,
          fingerprint,
        },
      );

      if (outcome === 'saved' && replaced !== null && replaced.keyID !== newKeyID) {
        await backend.removeKey(replaced.keyID);
      }

      return outcome;
    });

    if (written === 'removed') {
      // A credential that still holds a token was connected again while the refresh ran. Google ends
      // the whole grant when it revokes any token of it, so the reply is dropped without a revocation.
      const isRenewed = (await backend.readToken(handle.credentialID)) !== null;

      const isRevoked = isRenewed
        ? false
        : await revoke(handle, client.clientSecret, pickRevocable(result.reply));

      await backend.removeKey(newKeyID);

      await options.recorder.write({
        event: 'refresh_discarded',
        credentialID: handle.credentialID,
        attemptID,
        isRevoked,
      });

      return 'removed';
    }

    await addCurrentOwnValues(handle.credentialID, renewed, handle.removalCounter);

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

    await writeState(handle.credentialID, failure.token.state, next, handle.removalCounter);

    return next.status === 'needs_consent' ? 'needs_consent' : 'failed';
  };

  // A refresh of a handle that carries an older counter never joins the refresh of a credential
  // that was removed and connected again.
  const runGuarded = async (handle: HeldHandle, key: string): Promise<RefreshOutcome> => {
    try {
      return await runRefresh(handle);
    } finally {
      inFlight.delete(key);
    }
  };

  const startRefresh = (handle: HeldHandle): Promise<RefreshOutcome> => {
    const key = `${handle.credentialID}:${String(handle.removalCounter)}`;
    const running = inFlight.get(key);

    if (running !== undefined) {
      return running;
    }

    const started = runGuarded(handle, key);

    inFlight.set(key, started);

    return started;
  };

  const refresh: HeldCredentials['refresh'] = async (handle) => {
    await checkCounter(handle);

    return startRefresh(handle);
  };

  const refreshIfDue: HeldCredentials['refreshIfDue'] = async (handle) => {
    const token = await backend.readToken(handle.credentialID);

    await checkCounter(handle);

    if (
      token === null ||
      token.refreshToken === null ||
      token.state.status === 'needs_consent' ||
      !isDue(token, options.now())
    ) {
      return null;
    }

    return startRefresh(handle);
  };

  const readCurrentToken: HeldCredentials['readCurrentToken'] = async (handle) => {
    const token = await backend.readToken(handle.credentialID);

    await checkCounter(handle);

    if (token === null) {
      throw new CredentialRemovedError(handle.label);
    }

    if (token.state.status === 'needs_consent') {
      throw new CredentialRefusalError(`the credential ${handle.label} needs the owner's consent`);
    }

    if (token.accessToken === '') {
      throw new CredentialRefusalError(`the credential ${handle.label} has no access token yet`);
    }

    return token.accessToken;
  };

  const exchangeWriter = {
    backend,
    now: options.now,
    writeState,
    addOwnValues: addCurrentOwnValues,
  };

  return {
    readCounter: backend.readRemovalCounter,
    checkCounter,
    withSendCheck: (handle, start) =>
      removalLock.withLock(handle.credentialID, async () => {
        await checkCounter(handle);

        return start();
      }),
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

      const result = await sendTokenRequest(
        send,
        client.provider.tokenURL,
        {
          grant_type: 'authorization_code',
          code: request.code,
          redirect_uri: request.redirectURI,
          client_id: client.provider.clientID,
          client_secret: secret.clientSecret,
          ...(request.codeVerifier === undefined ? {} : { code_verifier: request.codeVerifier }),
        },
        options.requestTimeoutMs,
      );

      if (result.kind !== 'tokens') {
        throw new TokenRequestError(result.kind, pickProviderError(result));
      }

      // Revoking a token of an account ends its whole grant, so the caller may veto the revocation
      // when another connection of the same account still uses the grant.
      const dropTokens = async (subject: string | null): Promise<void> => {
        if (request.probeRevocable !== undefined && !(await request.probeRevocable(subject))) {
          return;
        }

        await revoke(client, secret.clientSecret, pickRevocable(result.reply));
      };

      const account = await readAccount(result.reply, client.provider, options.now(), () =>
        dropTokens(null),
      );

      const subject = account?.subject ?? null;

      // an exchange with no refresh token keeps nothing and revokes what it received
      if (result.reply.refresh_token === undefined) {
        await dropTokens(subject);

        throw new TokenRequestError('no_refresh_token');
      }

      try {
        await checkCounter(client);
      } catch (error) {
        await dropTokens(subject);

        throw error;
      }

      const kept = { isKept: false };

      const written = await slotLock
        .withLock(request.credentialID, () =>
          writeExchangedToken(exchangeWriter, {
            clientCredentialID: client.credentialID,
            request,
            reply: result.reply,
            account,
            tokenCounter,
            client: { credentialID: client.credentialID, expectedCounter: client.removalCounter },
            onKept: () => {
              kept.isKept = true;
            },
          }),
        )
        .catch(async (error: unknown) => {
          if (!kept.isKept) {
            await dropTokens(subject);
          }

          throw error;
        });

      if (written.kind === 'saved') {
        return written.result;
      }

      await dropTokens(subject);

      throw match(written)
        .with({ kind: 'removed' }, () => new CredentialRemovedError(client.label))
        .with({ kind: 'account_changed' }, () => new TokenRequestError('account_changed'))
        .exhaustive();
    },
    readAccessToken: async (handle) => {
      await refreshIfDue(handle);

      return readCurrentToken(handle);
    },
    readCurrentToken,
    markFailing: async (handle, reason) => {
      const token = await backend.readToken(handle.credentialID);

      if (token === null) {
        return;
      }

      await writeState(
        handle.credentialID,
        token.state,
        { ...token.state, status: 'failing', reason, sinceMs: options.now() },
        handle.removalCounter,
      );
    },
    revoke: async (handle) => {
      const token = await backend.readTokenForRevocation(handle.credentialID);

      if (token === null) {
        return { outcome: 'not_attempted', status: null, providerError: null };
      }

      const client = await backend.readClient(token.clientCredentialID);

      const value = token.refreshToken ?? token.accessToken;

      if (client === null || value === '') {
        return { outcome: 'not_attempted', status: null, providerError: null };
      }

      return sendRevocation(options, handle.provider, client.clientSecret, value);
    },
    readState: async (handle) => {
      const token = await backend.readToken(handle.credentialID);

      await checkCounter(handle);

      return token?.state ?? null;
    },
    trackRequest: (credentialID) => {
      const controller = new AbortController();

      const active = requests.get(credentialID) ?? new Set<AbortController>();

      active.add(controller);
      requests.set(credentialID, active);

      return {
        signal: controller.signal,
        end: () => {
          active.delete(controller);
        },
      };
    },
    remove: (credentialID) => {
      for (const controller of requests.get(credentialID) ?? []) {
        controller.abort();
      }

      return removalLock.withLock(credentialID, async () => {
        await backend.remove(credentialID);

        options.ownValues.remove('connector_credentials', `held:${credentialID}:access`);
        options.ownValues.remove('connector_credentials', `held:${credentialID}:refresh`);
      });
    },
    moveOwnValues: (fromCredentialID, toCredentialID) =>
      removalLock.withLock(toCredentialID, async () => {
        options.ownValues.remove('connector_credentials', `held:${fromCredentialID}:access`);
        options.ownValues.remove('connector_credentials', `held:${fromCredentialID}:refresh`);

        const token = await backend.readToken(toCredentialID);

        if (token !== null) {
          addOwnValues(toCredentialID, token);
        }
      }),
    recover: () =>
      recoverLostRefreshes({
        backend,
        recorder: options.recorder,
        now: options.now,
        writeState,
      }),
  };
}
