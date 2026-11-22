import type { APIContext, APITables } from '../types';
import { isSessionLive } from './is-session-live';

// Reads whether a session is still live, with no write: it moves no last seen time and writes no
// refusal, so a session that only keeps a socket open still lapses at the idle limit.
export async function probeLiveSession(
  context: Pick<APIContext, 'clock' | 'log' | 'settings'>,
  identityID: string,
): Promise<boolean> {
  const row = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('identities')
    .select(['revoked_at', 'last_seen_at'])
    .where('identity_id', '=', identityID)
    .executeTakeFirst();

  return row !== undefined && isSessionLive(context, row);
}
