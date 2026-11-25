import type { HeldClient } from '@heynixie/credentials';
import type { JSONObject, WriteTransaction } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { ConnectionTables } from '../types';
import type { BackendContext } from './backend-context';
import { mintKey, removeKey } from './mint-key';
import { sealValue } from './seal-value';

// What an owner's registration adds to the client's row, and the record that commits with it.
export interface ClientRegistration {
  readonly shortID: string;
  readonly origin: string;
  readonly redirectURI: string;
  readonly pickerKey: string | null;
  readonly projectNumber: string | null;
  readonly secretFingerprint: string;

  // runs in the same transaction, after the record
  readonly settle?: (tx: WriteTransaction) => Promise<void>;
  readonly record: { readonly kind: 'connection.client_registered'; readonly payload: JSONObject };
}

// Seals the secret under a key of its own and saves it. A client that was saved before keeps its
// removal counter, and its old key goes once the new row commits.
export async function writeClientSecret(
  context: BackendContext,
  credentialID: string,
  client: HeldClient,
  registration: ClientRegistration | null = null,
): Promise<void> {
  const minted = await mintKey(context);

  const sealed = await sealValue(
    minted.key,
    { keyID: minted.keyID, table: 'oauth_clients', column: 'secret_sealed' },
    client.clientSecret,
  );

  const replacedKeyID = await withWriteTransaction(context.log.writer, async (tx) => {
    const tables = tx.$extendTables<ConnectionTables>();

    const existing = await tables
      .selectFrom('oauth_clients')
      .select('key_id')
      .where('oauth_client_id', '=', credentialID)
      .executeTakeFirst();

    if (existing === undefined) {
      await tables
        .insertInto('oauth_clients')
        .values({
          oauth_client_id: credentialID,
          provider_client_id: client.clientID,
          key_id: minted.keyID,
          secret_sealed: sealed,
          created_at: context.now(),
          ...toRegistrationColumns(registration),
        })
        .execute();
    } else {
      await tables
        .updateTable('oauth_clients')
        .set({
          provider_client_id: client.clientID,
          key_id: minted.keyID,
          secret_sealed: sealed,
          removed_at: null,
          ...toRegistrationColumns(registration),
        })
        .where('oauth_client_id', '=', credentialID)
        .execute();
    }

    await tables.deleteFrom('key_marks').where('key_id', '=', minted.keyID).execute();

    if (registration !== null) {
      await writeRecordsInTransaction(tx, context.log, [
        {
          kind: registration.record.kind,
          payload: registration.record.payload,
          definitions: context.definitions(),
        },
      ]);

      await registration.settle?.(tx);
    }

    if (existing !== undefined) {
      await tables
        .insertInto('key_marks')
        .values({ key_id: existing.key_id, marked_at: context.now() })
        .onConflict((conflict) => conflict.doNothing())
        .execute();
    }

    return existing?.key_id ?? null;
  });

  context.heldKeys.delete(minted.keyID);

  if (replacedKeyID !== null) {
    await removeKey(context, replacedKeyID);
  }
}

function toRegistrationColumns(registration: ClientRegistration | null) {
  if (registration === null) {
    return {};
  }

  return {
    short_id: registration.shortID,
    origin: registration.origin,
    redirect_uri: registration.redirectURI,
    picker_key: registration.pickerKey,
    project_number: registration.projectNumber,
    secret_fingerprint: registration.secretFingerprint,
  };
}
