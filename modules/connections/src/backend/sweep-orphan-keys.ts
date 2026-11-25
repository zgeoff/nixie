import type { ConnectionTables } from '../types';
import type { BackendContext } from './backend-context';
import { removeKey } from './mint-key';

// Deletes each marked key that no row, no unfinished refresh and no save in flight names, and
// returns the key IDs it deleted. The in-flight set is read first, so a key that left it already
// has the row that names it.
export async function sweepOrphanKeys(context: BackendContext): Promise<readonly string[]> {
  const inFlight = new Set(context.heldKeys);

  const tables = context.log.writer.db.$extendTables<ConnectionTables>();

  const marks = await tables.selectFrom('key_marks').select('key_id').execute();

  if (marks.length === 0) {
    return [];
  }

  const connections = await tables
    .selectFrom('connections')
    .select(['key_id', 'token_key_id'])
    .execute();

  // a removed client keeps its row and loses its secret, so its key is no longer named
  const clients = await tables
    .selectFrom('oauth_clients')
    .select('key_id')
    .where('secret_sealed', 'is not', null)
    .execute();

  const refreshes = await context.recorder.readOpenRefreshes();

  const named = new Set<string>(inFlight);

  for (const row of connections) {
    named.add(row.key_id);

    if (row.token_key_id !== null) {
      named.add(row.token_key_id);
    }
  }

  for (const row of clients) {
    named.add(row.key_id);
  }

  for (const refresh of refreshes) {
    named.add(refresh.newKeyID);
  }

  const orphans = marks.map((mark) => mark.key_id).filter((keyID) => !named.has(keyID));

  for (const keyID of orphans) {
    await removeKey(context, keyID);
  }

  return orphans;
}
