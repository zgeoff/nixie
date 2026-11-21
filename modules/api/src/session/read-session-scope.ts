import type { APIContext, APITables, SessionScope } from '../types';
import { deriveSecretHash } from '../utils/derive-secret-hash';
import { isSessionLive } from './is-session-live';

// The scope of the live session that a token belongs to, or null for a token of no live session,
// so a browser that kept the cookie of an ended device session can enrol again. It reads only.
export async function readSessionScope(
  context: Pick<APIContext, 'clock' | 'log' | 'settings'>,
  token: string | undefined,
): Promise<SessionScope | null> {
  if (token === undefined || token === '') {
    return null;
  }

  const row = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('identities')
    .select(['scope', 'revoked_at', 'last_seen_at'])
    .where('token_hash', '=', deriveSecretHash(token))
    .executeTakeFirst();

  return row !== undefined && isSessionLive(context, row) ? row.scope : null;
}
