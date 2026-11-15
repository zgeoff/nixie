import type { Transaction } from 'kysely';
import type { APITables } from '../types';

// A reset keeps every live passkey and deletes every revoked one.
export async function removeRevokedPasskeys(tx: Transaction<unknown>): Promise<void> {
  await tx
    .$extendTables<APITables>()
    .deleteFrom('passkeys')
    .where('revoked_at', 'is not', null)
    .execute();
}
