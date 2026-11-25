import type { HeldClient } from '@heynixie/credentials';
import { readRecordKeys } from '@heynixie/log';
import type { ConnectionTables } from '../types';
import type { BackendContext } from './backend-context';
import { openValue } from './seal-value';

// The client of a credential that is not removed, or null when its secret is gone or unreadable.
export async function readClientSecret(
  context: BackendContext,
  credentialID: string,
): Promise<HeldClient | null> {
  const row = await context.log.writer.db
    .$extendTables<ConnectionTables>()
    .selectFrom('oauth_clients')
    .select(['provider_client_id', 'key_id', 'secret_sealed', 'removed_at'])
    .where('oauth_client_id', '=', credentialID)
    .executeTakeFirst();

  if (row === undefined || row.removed_at !== null || row.secret_sealed === null) {
    return null;
  }

  const keys = await readRecordKeys(context.log, [row.key_id]);

  const key = keys.get(row.key_id);

  if (key === undefined || key === null) {
    return null;
  }

  try {
    const clientSecret = await openValue(
      key,
      { keyID: row.key_id, table: 'oauth_clients', column: 'secret_sealed' },
      row.secret_sealed,
    );

    return { clientID: row.provider_client_id, clientSecret };
  } catch {
    return null;
  }
}
