import type { Log } from '@heynixie/log';
import { readRecordKeys } from '@heynixie/log';
import { z } from 'zod';
import { openValue } from '../backend/seal-value';
import type { ConnectionTables } from '../types';

// The address that one reference of a snapshot names, or null once its connection is not live or
// its key is gone. A reference with no address row is the ID of a connection that has kept no
// address since it was made, which reads the connection's own account.
export async function readOwnerAddress(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  addressRef: string,
): Promise<string | null> {
  const tables = log.writer.db.$extendTables<ConnectionTables>();

  const version = await tables
    .selectFrom('connection_addresses')
    .select(['connection_id', 'account_sealed'])
    .where('address_ref', '=', addressRef)
    .executeTakeFirst();

  const connectionID = version?.connection_id ?? addressRef;

  const row = await tables
    .selectFrom('connections')
    .select(['key_id', 'account_sealed', 'binding', 'token_fingerprint'])
    .where('connection_id', '=', connectionID)
    .executeTakeFirst();

  if (row?.binding !== 'enabled' || row.token_fingerprint === null) {
    return null;
  }

  // a connection that keeps its addresses answers only the references it keeps
  const kept = version === undefined ? await probeKeptAddress(log, connectionID) : false;
  const sealed = version?.account_sealed ?? row.account_sealed;

  if (kept || sealed === null) {
    return null;
  }

  return openAddress(log, row.key_id, sealed);
}

async function probeKeptAddress(log: Pick<Log, 'writer'>, connectionID: string): Promise<boolean> {
  const kept = await log.writer.db
    .$extendTables<ConnectionTables>()
    .selectFrom('connection_addresses')
    .select('address_ref')
    .where('connection_id', '=', connectionID)
    .executeTakeFirst();

  return kept !== undefined;
}

const accountSchema = z.object({ email: z.string().nullish() });

async function openAddress(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  keyID: string,
  sealed: Uint8Array<ArrayBuffer>,
): Promise<string | null> {
  const keys = await readRecordKeys(log, [keyID]);

  const key = keys.get(keyID) ?? null;

  if (key === null) {
    return null;
  }

  try {
    const text = await openValue(
      key,
      { keyID, table: 'connections', column: 'account_sealed' },
      sealed,
    );

    const parsed = accountSchema.safeParse(JSON.parse(text));

    return parsed.success ? (parsed.data.email ?? null) : null;
  } catch {
    return null;
  }
}
