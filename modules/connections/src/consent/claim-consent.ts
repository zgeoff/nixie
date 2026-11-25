import { readRecordKeys, withWriteTransaction } from '@heynixie/log';
import { removeKey } from '../backend/mint-key';
import { openValue } from '../backend/seal-value';
import type { ServiceContext } from '../service-context';
import type { ConnectionTables, ConsentRow } from '../types';
import { hashConsentState } from './hash-consent-state';

export interface ClaimedConsent {
  readonly request: ConsentRow;
  readonly verifier: string;
}

// Takes the consent that a state names, once. A request that is unknown, used, lapsed, or started by
// another device session claims nothing and stays as it is, so a link that an attacker sends cannot
// use up the owner's consent. A claim deletes the key of the verifier, so no other call opens it.
export async function claimConsent(
  context: ServiceContext,
  deviceSessionID: string,
  state: string,
): Promise<ClaimedConsent | null> {
  const tables = context.log.writer.db.$extendTables<ConnectionTables>();

  const request = await tables
    .selectFrom('consent_requests')
    .selectAll()
    .where('state_hash', '=', hashConsentState(state))
    .executeTakeFirst();

  if (
    request === undefined ||
    request.device_session_id !== deviceSessionID ||
    request.claimed_at !== null ||
    request.expires_at <= context.now()
  ) {
    return null;
  }

  const claimedAtMs = context.now();

  const claimed = await withWriteTransaction(context.log.writer, (tx) =>
    tx
      .$extendTables<ConnectionTables>()
      .updateTable('consent_requests')
      .set({ claimed_at: claimedAtMs })
      .where('consent_id', '=', request.consent_id)
      .where('state_hash', '=', request.state_hash)
      .where('device_session_id', '=', deviceSessionID)
      .where('expires_at', '>', claimedAtMs)
      .where('claimed_at', 'is', null)
      .executeTakeFirst(),
  );

  if (claimed.numUpdatedRows === 0n) {
    return null;
  }

  const verifier = await openVerifier(context, request);

  await removeKey(context.backend.shared, request.key_id);

  if (verifier === null) {
    await removeConsentRequest(context, request.consent_id);

    return null;
  }

  return { request, verifier };
}

async function openVerifier(context: ServiceContext, request: ConsentRow): Promise<string | null> {
  const keys = await readRecordKeys(context.log, [request.key_id]);

  const key = keys.get(request.key_id) ?? null;

  if (key === null) {
    return null;
  }

  try {
    return await openValue(
      key,
      { keyID: request.key_id, table: 'consent_requests', column: 'verifier_sealed' },
      request.verifier_sealed,
    );
  } catch {
    return null;
  }
}

export async function removeConsentRequest(
  context: Pick<ServiceContext, 'log'>,
  consentID: string,
): Promise<void> {
  await withWriteTransaction(context.log.writer, (tx) =>
    tx
      .$extendTables<ConnectionTables>()
      .deleteFrom('consent_requests')
      .where('consent_id', '=', consentID)
      .execute(),
  );
}
