import { createEnrolmentCode } from './create-enrolment-code';
import type { APIContext, APITables } from './types';

// Issues the code that nixie prints to its log at start, while no device holds a live session, so
// the first device can sign in. It answers null once a device has a session that is neither
// revoked nor lapsed.
export async function createFirstEnrolmentCode(
  context: APIContext,
): Promise<{ readonly code: string; readonly expiresAt: Date } | null> {
  const live = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('identities')
    .select('identity_id')
    .where('channel', '=', 'client')
    .where('revoked_at', 'is', null)
    .where('last_seen_at', '>=', context.clock.now() - context.settings.sessionIdleMs)
    .executeTakeFirst();

  return live === undefined ? createEnrolmentCode(context) : null;
}
