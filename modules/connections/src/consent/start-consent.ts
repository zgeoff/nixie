import { readRecordKeys, withWriteTransaction } from '@heynixie/log';
import { mintKey } from '../backend/mint-key';
import { openValue, sealValue } from '../backend/seal-value';
import { readLiveClient } from '../client/read-live-client';
import { readConnectionRowByShortID } from '../connection/read-connection-rows';
import type { ServiceContext } from '../service-context';
import type {
  ClientRow,
  ConnectionTables,
  OperationAttempt,
  StartConsentInput,
  StartConsentResult,
} from '../types';
import { buildConsentURL } from './build-consent-url';
import { buildPKCEChallenge } from './build-pkce-challenge';
import { hashConsentState } from './hash-consent-state';

// Begins a consent: a state bound to the device session that asked, and a PKCE verifier sealed under
// a key of its own. The state and the URL are never kept: only the state's hash is. A retry of an
// earlier try gets a fresh state and URL that replace the first ones, with the first expiry.
export function startConsent(
  context: ServiceContext,
  input: StartConsentInput,
  attempt?: OperationAttempt<StartConsentResult>,
): Promise<StartConsentResult> {
  return context.lock.withLock(async () => {
    const client = await readLiveClient(context);

    if (client === null) {
      return { kind: 'client_missing' };
    }

    const target =
      input.connection === null
        ? null
        : await readConnectionRowByShortID(context.log, input.connection);

    if (input.connection !== null && target?.binding !== 'enabled') {
      return { kind: 'connection_not_found' };
    }

    const retried =
      input.consentID === undefined ? null : await restartConsent(context, client, input);

    if (retried !== null) {
      return retried;
    }

    return beginConsent(context, client, input, {
      connectionID: target?.connection_id ?? null,
      attempt,
    });
  });
}

// Makes the state again for a consent that an earlier try began and that has not lapsed or been used.
async function restartConsent(
  context: ServiceContext,
  client: ClientRow,
  input: StartConsentInput,
): Promise<StartConsentResult | null> {
  const tables = context.log.writer.db.$extendTables<ConnectionTables>();

  const row = await tables
    .selectFrom('consent_requests')
    .selectAll()
    .where('consent_id', '=', input.consentID ?? '')
    .where('device_session_id', '=', input.deviceSessionID)
    .where('claimed_at', 'is', null)
    .where('expires_at', '>', context.now())
    .executeTakeFirst();

  if (row === undefined) {
    return null;
  }

  const keys = await readRecordKeys(context.log, [row.key_id]);

  const key = keys.get(row.key_id) ?? null;

  if (key === null) {
    return null;
  }

  const verifier = await openValue(
    key,
    { keyID: row.key_id, table: 'consent_requests', column: 'verifier_sealed' },
    row.verifier_sealed,
  );

  const state = buildRandomToken();

  await withWriteTransaction(context.log.writer, (tx) =>
    tx
      .$extendTables<ConnectionTables>()
      .updateTable('consent_requests')
      .set({ state_hash: hashConsentState(state) })
      .where('consent_id', '=', row.consent_id)
      .execute(),
  );

  return {
    kind: 'started',
    consentID: row.consent_id,
    expiresAt: row.expires_at,
    consentURL: buildURL(context, client, state, verifier),
  };
}

// 32 random bytes, which is the length RFC 7636 asks of a verifier and more than a state needs.
function buildRandomToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64url');
}

function buildURL(
  context: ServiceContext,
  client: ClientRow,
  state: string,
  verifier: string,
): string {
  return buildConsentURL(context.spec, {
    clientID: client.provider_client_id,
    redirectURI: client.redirect_uri ?? '',
    state,
    challenge: buildPKCEChallenge(verifier),
  });
}

interface ConsentBegin {
  readonly connectionID: string | null;
  readonly attempt: OperationAttempt<StartConsentResult> | undefined;
}

async function beginConsent(
  context: ServiceContext,
  client: ClientRow,
  input: StartConsentInput,
  begin: ConsentBegin,
): Promise<StartConsentResult> {
  const consentID = crypto.randomUUID();
  const state = buildRandomToken();
  const verifier = buildRandomToken();
  const nowMs = context.now();
  const expiresAt = nowMs + context.consentLifetimeMs;

  const minted = await mintKey(context.backend.shared);

  const sealed = await sealValue(
    minted.key,
    { keyID: minted.keyID, table: 'consent_requests', column: 'verifier_sealed' },
    verifier,
  );

  const started: StartConsentResult = {
    kind: 'started',
    consentID,
    expiresAt,
    consentURL: buildURL(context, client, state, verifier),
  };

  await withWriteTransaction(context.log.writer, async (tx) => {
    const tables = tx.$extendTables<ConnectionTables>();

    await tables
      .insertInto('consent_requests')
      .values({
        consent_id: consentID,
        state_hash: hashConsentState(state),
        device_session_id: input.deviceSessionID,
        oauth_client_id: client.oauth_client_id,
        connection_id: begin.connectionID,
        key_id: minted.keyID,
        verifier_sealed: sealed,
        created_at: nowMs,
        expires_at: expiresAt,
      })
      .execute();

    await tables.deleteFrom('key_marks').where('key_id', '=', minted.keyID).execute();
    await begin.attempt?.settle(tx, started);
  });

  context.backend.shared.heldKeys.delete(minted.keyID);

  return started;
}
