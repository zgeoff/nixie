import type { APIContext, APITables } from '../types';
import { deriveSecretHash } from '../utils/derive-secret-hash';
import { isSessionLive } from './is-session-live';

// The ID of the live full-scope session that a token belongs to, or null. It reads only, and a
// token that belongs to no live session writes no refusal.
export async function readSessionIdentity(
  context: Pick<APIContext, 'clock' | 'log' | 'settings'>,
  token: string | undefined,
): Promise<string | null> {
  if (token === undefined || token === '') {
    return null;
  }

  const row = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('identities')
    .select(['identity_id', 'scope', 'revoked_at', 'last_seen_at'])
    .where('token_hash', '=', deriveSecretHash(token))
    .executeTakeFirst();

  return row !== undefined && row.scope === 'full' && isSessionLive(context, row)
    ? row.identity_id
    : null;
}
