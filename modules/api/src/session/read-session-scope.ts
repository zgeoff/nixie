import type { APIContext, APITables, SessionScope } from '../types';
import { deriveSecretHash } from '../utils/derive-secret-hash';

// The scope of the session that a token belongs to, or null for a token of no session. It reads
// only: the call that follows resolves the session and writes its last seen time and its refusal.
export async function readSessionScope(
  context: Pick<APIContext, 'log'>,
  token: string | undefined,
): Promise<SessionScope | null> {
  if (token === undefined || token === '') {
    return null;
  }

  const row = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('identities')
    .select('scope')
    .where('token_hash', '=', deriveSecretHash(token))
    .executeTakeFirst();

  return row?.scope ?? null;
}
