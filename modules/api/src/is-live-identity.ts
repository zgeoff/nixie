import type { Transaction } from 'kysely';
import type { APIContext, APITables } from './types';

// Checks inside an action's write transaction that the caller's session is still neither revoked
// nor lapsed, so a revoke that commits after the call resolved its session still stops the action.
export async function isLiveIdentity(
  tx: Transaction<unknown>,
  context: APIContext,
  identityID: string,
): Promise<boolean> {
  const row = await tx
    .$extendTables<APITables>()
    .selectFrom('identities')
    .select('identity_id')
    .where('identity_id', '=', identityID)
    .where('revoked_at', 'is', null)
    .where('last_seen_at', '>=', context.clock.now() - context.settings.sessionIdleMs)
    .executeTakeFirst();

  return row !== undefined;
}
