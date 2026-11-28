import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { removeKey } from '../backend/mint-key';
import type { ConnectionAccount } from '../connection/open-connection-values';
import { openConnectionValues, sealConnectionValues } from '../connection/open-connection-values';
import { readConnectionRowByID } from '../connection/read-connection-rows';
import { writeAddressVersion } from '../connection/write-address-version';
import { connectedCodec } from '../record/connected-codec';
import type { ServiceContext } from '../service-context';
import { pickRowAttention } from '../status/pick-row-attention';
import type { ConnectionRow, ConnectionTables } from '../types';
import type { FinishedConsent } from './write-new-connection';

// Moves the consent's token into the live connection that reaches the same account, and deletes the
// consent's own credential. The connection advances its removal counter, so a refresh that began
// before saves nothing. Answers `stale` when a forget took the connection first.
export async function writeRenewedConnection(
  context: ServiceContext,
  finished: FinishedConsent,
  targetID: string,
): Promise<'written' | 'stale'> {
  const target = await readConnectionRowByID(context.log, targetID);

  if (target?.binding !== 'enabled') {
    return 'stale';
  }

  const sealed = await sealConnectionValues(context.log, target, {
    account: finished.account,
    label: null,
  });

  if (sealed === null) {
    return 'stale';
  }

  const isAddressNew = await probeAddressNew(context, target, finished.account);

  const wasAttending = pickRowAttention(target, context.now()) !== null;

  const written = await withWriteTransaction(context.log.writer, async (tx) => {
    const tables = tx.$extendTables<ConnectionTables>();

    const credential = await tables
      .selectFrom('connections')
      .selectAll()
      .where('connection_id', '=', finished.credential.connection_id)
      .executeTakeFirst();

    const current = await tables
      .selectFrom('connections')
      .select(['binding', 'removal_counter', 'token_key_id', 'short_id', 'account_sealed'])
      .where('connection_id', '=', targetID)
      .executeTakeFirst();

    if (
      credential === undefined ||
      credential.binding !== 'enabled' ||
      credential.removal_counter !== finished.credential.removal_counter ||
      current?.binding !== 'enabled' ||
      current.removal_counter !== target.removal_counter
    ) {
      return null;
    }

    const counter = current.removal_counter + 1;

    // A snapshot names an address by its reference, so a new address takes a new one and the
    // address before keeps its own, the first address of a connection made before addresses were
    // kept included.
    if (isAddressNew && current.account_sealed !== null) {
      await writeAddressVersion(tx, {
        addressRef: targetID,
        connectionID: targetID,
        accountSealed: current.account_sealed,
        createdAt: context.now(),
      });

      await writeAddressVersion(tx, {
        addressRef: crypto.randomUUID(),
        connectionID: targetID,
        accountSealed: sealed.account,
        createdAt: context.now(),
      });
    }

    await tables
      .updateTable('connections')
      .set({
        account_sealed: sealed.account,
        token_key_id: credential.token_key_id,
        refresh_token_sealed: credential.refresh_token_sealed,
        status: 'active',
        status_reason: null,
        status_since: credential.status_since,
        last_success_at: credential.last_success_at,
        failures: 0,
        retry_at: null,
        removal_counter: counter,
        granted_scopes: JSON.stringify(finished.scopes),
        missing_scopes: JSON.stringify(finished.missing),
        refresh_expires_at: finished.refreshExpiresAtMs,
        token_fingerprint: finished.fingerprint,
      })
      .where('connection_id', '=', targetID)
      .execute();

    await tables
      .deleteFrom('connections')
      .where('connection_id', '=', credential.connection_id)
      .execute();

    await tables
      .deleteFrom('consent_requests')
      .where('consent_id', '=', finished.consentID)
      .execute();

    // the key of the token this one replaces, and the account key of the credential that is gone
    const unnamed = [current.token_key_id, credential.key_id].filter((keyID) => keyID !== null);

    for (const keyID of unnamed) {
      await tables
        .insertInto('key_marks')
        .values({ key_id: keyID, marked_at: context.now() })
        .onConflict((conflict) => conflict.doNothing())
        .execute();
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: connectedCodec.kind,
        definitions: context.definitions(),
        payload: connectedCodec.encode({
          connection: targetID,
          shortID: current.short_id,
          scopes: [...finished.scopes],
          missing: [...finished.missing],
          fingerprint: finished.fingerprint,
          again: true,
          wasAttending,
        }),
      },
    ]);

    return { counter, unnamed, credential };
  });

  if (written === null) {
    return 'stale';
  }

  moveAccessToken(context, finished.credential, targetID, written.counter);

  // the tokens were live under the consent's own credential, which no longer exists
  await context.store.moveOwnValues(
    { backend: 'database', credentialID: finished.credential.connection_id },
    { backend: 'database', credentialID: targetID },
  );

  for (const keyID of written.unnamed) {
    await removeKey(context.backend.shared, keyID);
  }

  return 'written';
}

// true when the renewal reaches an address that the connection's account did not hold.
async function probeAddressNew(
  context: ServiceContext,
  target: ConnectionRow,
  account: ConnectionAccount,
): Promise<boolean> {
  const opened = await openConnectionValues(context.log, [target]);

  const before = opened.get(target.connection_id)?.account?.email ?? null;

  return before?.toLowerCase() !== account.email?.toLowerCase();
}

// The access token that the exchange kept in memory follows the token to its connection, under the
// new counter, so the first call after a consent needs no refresh.
function moveAccessToken(
  context: ServiceContext,
  credential: ConnectionRow,
  targetID: string,
  counter: number,
): void {
  const tokens = context.backend.shared.accessTokens;
  const from = `${credential.connection_id}:${String(credential.removal_counter)}`;
  const kept = tokens.get(from);

  for (const key of tokens.keys()) {
    if (key.startsWith(`${targetID}:`) || key.startsWith(`${credential.connection_id}:`)) {
      tokens.delete(key);
    }
  }

  if (kept !== undefined) {
    tokens.set(`${targetID}:${String(counter)}`, kept);
  }
}
