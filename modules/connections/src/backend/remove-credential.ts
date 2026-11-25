import type { WriteTransaction } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { ConnectionTables } from '../types';
import { advanceRemoval } from './advance-removal';
import type { BackendContext } from './backend-context';
import { removeKey } from './mint-key';

// Removes a credential and advances its removal counter in one transaction, and returns the new
// counter. A connection only begins its removal, because its token must stay readable for the
// revocation that a forget sends. An OAuth client loses its secret and its key.
export async function removeCredential(
  context: BackendContext,
  credentialID: string,
): Promise<number> {
  for (const key of context.accessTokens.keys()) {
    if (key.startsWith(`${credentialID}:`)) {
      context.accessTokens.delete(key);
    }
  }

  const removed = await withWriteTransaction(context.log.writer, async (tx) => {
    const advanced = await advanceRemoval(tx, credentialID, context.now());

    if (advanced !== null) {
      return { counter: advanced, keyID: null };
    }

    return removeClient(tx, context, credentialID);
  });

  if (removed.keyID !== null) {
    await removeKey(context, removed.keyID);
  }

  return removed.counter;
}

async function removeClient(
  tx: WriteTransaction,
  context: BackendContext,
  credentialID: string,
): Promise<{ readonly counter: number; readonly keyID: string | null }> {
  const tables = tx.$extendTables<ConnectionTables>();

  const row = await tables
    .selectFrom('oauth_clients')
    .select(['removal_counter', 'key_id', 'removed_at'])
    .where('oauth_client_id', '=', credentialID)
    .executeTakeFirst();

  if (row === undefined) {
    return { counter: 0, keyID: null };
  }

  const counter = row.removal_counter + 1;

  await tables
    .updateTable('oauth_clients')
    .set({
      removal_counter: counter,
      secret_sealed: null,
      removed_at: row.removed_at ?? context.now(),
    })
    .where('oauth_client_id', '=', credentialID)
    .execute();

  await tables
    .insertInto('key_marks')
    .values({ key_id: row.key_id, marked_at: context.now() })
    .onConflict((conflict) => conflict.doNothing())
    .execute();

  return { counter, keyID: row.key_id };
}
