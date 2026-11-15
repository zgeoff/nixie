import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import type { APIContext, APITables } from '../types';

interface PasskeyRevocation {
  readonly passkeyID: string;

  // an identity ID, or 'host'
  readonly revokedBy: string;
}

// Revokes a live passkey and returns when it was revoked. A passkey that is revoked already keeps
// its time.
export async function updatePasskeyRevoked(
  tx: Transaction<unknown>,
  context: APIContext,
  revocation: PasskeyRevocation,
): Promise<number> {
  const db = tx.$extendTables<APITables>();

  const row = await db
    .selectFrom('passkeys')
    .select('revoked_at')
    .where('passkey_id', '=', revocation.passkeyID)
    .executeTakeFirstOrThrow();

  if (row.revoked_at !== null) {
    return row.revoked_at;
  }

  const revokedAt = context.clock.now();

  await db
    .updateTable('passkeys')
    .set({ revoked_at: revokedAt })
    .where('passkey_id', '=', revocation.passkeyID)
    .execute();

  await writeRecordsInTransaction(tx, context.log, [
    {
      kind: 'passkey.revoked',
      definitions: context.definitions(),
      payload: { passkeyID: revocation.passkeyID, revokedBy: revocation.revokedBy },
    },
  ]);

  return revokedAt;
}
