import invariant from 'tiny-invariant';
import { match } from 'ts-pattern';
import { readClientByID } from '../client/read-client-by-id';
import { readRowContext } from '../connection/read-connection-context';
import { readConnectionRowByID } from '../connection/read-connection-rows';
import { pickDefaultLabel } from '../connector/pick-default-label';
import { buildProviderSpec } from '../provider/build-provider-spec';
import type { ServiceContext } from '../service-context';
import type { ConnectionMissingScope, FinishConsentInput, FinishConsentResult } from '../types';
import { claimConsent, removeConsentRequest } from './claim-consent';
import { discardConsent } from './discard-consent';
import { pickConsentOutcome } from './pick-consent-outcome';
import type { ConsentOutcome } from './pick-consent-outcome';
import { pickExchangeFailure } from './pick-exchange-failure';
import { pickGrantedShortScopes } from './pick-granted-short-scopes';
import { probeLiveAccount } from './probe-live-account';
import { readKnownAccounts, readLiveLabels } from './read-known-accounts';
import { waitForForget } from './wait-for-forget';
import type { FinishedConsent } from './write-new-connection';
import { writeNewConnection } from './write-new-connection';
import { writeRenewedConnection } from './write-renewed-connection';

// Finishes a consent that Google sent the owner's browser back from. The state works once, for the
// device session that started it. The account comes from the ID token, and each scope is read once
// before the connection is written.
export async function finishConsent(
  context: ServiceContext,
  input: FinishConsentInput,
): Promise<FinishConsentResult> {
  const claim = await claimConsent(context, input.deviceSessionID, input.state);

  if (claim === null) {
    return { kind: 'consent_not_found' };
  }

  const consentID = claim.request.consent_id;

  const client = await readClientByID(context, claim.request.oauth_client_id);

  if (input.error !== null || input.code === null) {
    await removeConsentRequest(context, consentID);

    return { kind: 'consent_refused' };
  }

  if (client?.redirect_uri === null || client === null) {
    await removeConsentRequest(context, consentID);

    return { kind: 'consent_not_found' };
  }

  const credentialID = crypto.randomUUID();

  const clientBinding = await context.store.register(
    { backend: 'database', credentialID: client.oauth_client_id },
    buildProviderSpec(context.endpoints, {
      kind: 'oauth_client',
      clientID: client.provider_client_id,
    }),
  );

  const exchanged = await context.store
    .exchange(clientBinding, {
      code: input.code,
      redirectURI: client.redirect_uri,
      codeVerifier: claim.verifier,
      credentialID,
      probeRevocable: async (subject) => !(await probeLiveAccount(context, credentialID, subject)),
    })
    .catch(async (error: unknown) => {
      await removeConsentRequest(context, consentID);

      const failure = pickExchangeFailure(error);

      if (failure === null) {
        throw error;
      }

      return failure;
    });

  if ('kind' in exchanged) {
    return exchanged;
  }

  if (exchanged.account === null) {
    await discardConsent(context, {
      consentID,
      credentialID,
      reason: 'no_account',
      isRevoked: true,
    });

    return { kind: 'token_exchange_failed', providerError: 'id_token_malformed' };
  }

  const credential = await readConnectionRowByID(context.log, credentialID);

  invariant(credential, 'an exchange saved the credential that the consent named');

  const account = { subject: exchanged.account.subject, email: exchanged.account.email };

  const scopes = await readScopes(context, credential, {
    email: account.email,
    granted: exchanged.grantedScopes,
  });

  const token = await context.backend.readToken(credentialID);

  invariant(token !== null && token.refreshToken !== null, 'an exchange keeps a refresh token');

  const finished: FinishedConsent = {
    credential,
    consentID,
    account,
    scopes: scopes.granted,
    missing: scopes.missing,
    refreshExpiresAtMs: exchanged.refreshExpiresAtMs,
    fingerprint: await context.store.readFingerprint(token.refreshToken),
  };

  return settleConsent(context, finished, claim.request.connection_id);
}

interface ScopeFacts {
  readonly email: string | null;
  readonly granted: readonly string[];
}

interface ReadScopes {
  readonly granted: readonly string[];
  readonly missing: readonly ConnectionMissingScope[];
}

// The scopes the consent granted. The connector's check reads each one; when a read cannot say, the
// scopes the token response named stand in, and the daily check corrects them.
async function readScopes(
  context: ServiceContext,
  credential: Parameters<typeof readRowContext>[1],
  facts: ScopeFacts,
): Promise<ReadScopes> {
  const named = pickGrantedShortScopes(
    facts.granted,
    context.spec.scopePrefix,
    context.spec.scopes,
  );

  const fromToken: ReadScopes = {
    granted: named,
    missing:
      facts.granted.length === 0
        ? []
        : context.spec.scopes
            .filter((scope) => !named.includes(scope))
            .map((scope) => ({ scope, reason: 'not_granted' as const })),
  };

  const connection = await readRowContext(context, credential);

  if (connection === null) {
    return fromToken;
  }

  try {
    const report = await context.connector.check(
      { connectionID: credential.connection_id, connection: credential.short_id },
      { ...connection, account: facts.email ?? '' },
    );

    return { granted: report.grantedScopes, missing: report.missing };
  } catch {
    return fromToken;
  }
}

// Decides and writes under the module's lock, so two consents for one account cannot both read an
// empty account list and each write a new connection. The wait for a Forget to end runs outside the
// lock, and the decision is read again after it.
async function settleConsent(
  context: ServiceContext,
  finished: FinishedConsent,
  again: string | null,
): Promise<FinishConsentResult> {
  const settled = await context.lock.withLock(async () => {
    const outcome = await readOutcome(context, finished, again);

    return outcome.kind === 'wait'
      ? outcome
      : { kind: 'concluded' as const, result: await conclude(context, finished, outcome) };
  });

  if (settled.kind === 'concluded') {
    return settled.result;
  }

  const isFinished = await waitForForget(context, settled.connectionID);

  return isFinished
    ? settleConsent(context, finished, again)
    : conclude(context, finished, { kind: 'forget_in_progress' });
}

async function readOutcome(
  context: ServiceContext,
  finished: FinishedConsent,
  again: string | null,
): Promise<ConsentOutcome> {
  return pickConsentOutcome({
    again,
    subject: finished.account.subject,
    known: await readKnownAccounts(context, finished.credential.connection_id),
  });
}

type DecidedOutcome = ConsentOutcome | { readonly kind: 'forget_in_progress' };

function conclude(
  context: ServiceContext,
  finished: FinishedConsent,
  outcome: Exclude<DecidedOutcome, { readonly kind: 'wait' }>,
): Promise<FinishConsentResult> {
  const discard = (
    reason: 'account_mismatch' | 'connection_forgotten' | 'forget_in_progress',
    isRevoked: boolean,
  ) =>
    discardConsent(context, {
      consentID: finished.consentID,
      credentialID: finished.credential.connection_id,
      reason,
      isRevoked,
    });

  return match(outcome)
    .returnType<Promise<FinishConsentResult>>()
    .with({ kind: 'new' }, async () => {
      const labels = await readLiveLabels(context);

      const label = pickDefaultLabel({
        connectorID: context.connector.id,
        report: {
          grantedScopes: finished.scopes,
          accountName: finished.account.email,
          missing: [],
        },
        takenLabels: labels,
      });

      const written = await writeNewConnection(context, finished, label);

      if (written === 'stale') {
        await discard('connection_forgotten', true);

        return { kind: 'consent_not_found' };
      }

      return {
        kind: 'finished',
        connection: finished.credential.short_id,
        missing: finished.missing,
      };
    })
    .with({ kind: 'renew' }, async (renewal) => {
      const written = await writeRenewedConnection(context, finished, renewal.connectionID);
      const target = await readConnectionRowByID(context.log, renewal.connectionID);

      if (written === 'stale' || target === null) {
        await discard('connection_forgotten', false);

        return { kind: 'consent_not_found' };
      }

      return { kind: 'finished', connection: target.short_id, missing: finished.missing };
    })
    .with({ kind: 'forget_in_progress' }, async () => {
      await discard('forget_in_progress', false);

      return { kind: 'forget_in_progress' };
    })
    .with({ kind: 'discard' }, async (discarded) => {
      await discard(discarded.reason, discarded.isRevoked);

      return discarded.reason === 'account_mismatch'
        ? { kind: 'account_mismatch' }
        : { kind: 'consent_not_found' };
    })
    .exhaustive();
}
