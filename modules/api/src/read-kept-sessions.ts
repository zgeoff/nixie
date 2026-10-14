import type { Kysely } from 'kysely';
import type { APIContext, APITables } from './types';

// A session that a reset keeps, with what its session_kept record carries.
export interface KeptSession {
  readonly identityID: string;
  readonly channel: string;
  readonly label: string;
  readonly pairedAt: number;
}

// Reads the identities that are neither revoked nor lapsed, oldest first, which a reset keeps
// signed in. A revoked or lapsed identity has no use after the reset, so the reset removes it.
export async function readKeptSessions(
  db: Kysely<unknown>,
  context: Pick<APIContext, 'clock' | 'settings'>,
): Promise<readonly KeptSession[]> {
  const rows = await db
    .$extendTables<APITables>()
    .selectFrom('identities')
    .select(['identity_id', 'channel', 'label', 'paired_at'])
    .where('revoked_at', 'is', null)
    .where('last_seen_at', '>=', context.clock.now() - context.settings.sessionIdleMs)
    .orderBy('paired_at')
    .orderBy('identity_id')
    .execute();

  return rows.map((row) => ({
    identityID: row.identity_id,
    channel: row.channel,
    label: row.label,
    pairedAt: row.paired_at,
  }));
}
