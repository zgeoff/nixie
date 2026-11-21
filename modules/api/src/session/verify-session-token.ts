import { withWriteTransaction } from '@heynixie/log';
import { writeRefusal } from '../refusal/write-refusal';
import type { APIContext, APITables, Identity } from '../types';
import { deriveSecretHash } from '../utils/derive-secret-hash';
import { isReadOnlyToken } from './is-read-only-token';

// Every token nixie never issued shares this external ID, which no session ID equals, so a stranger
// with fresh random tokens still gets one refusal per interval.
const unknownTokenID = 'unknown-token';

export async function verifySessionToken(
  context: APIContext,
  token: string | undefined,
): Promise<Identity | null> {
  if (token === undefined || token === '') {
    return null;
  }

  if (isReadOnlyToken(context.settings, token)) {
    return buildReadOnlyCaller(context.clock.now());
  }

  const tokenHash = deriveSecretHash(token);

  const row = await readIdentityRow(context, tokenHash);

  if (row === undefined || !isLive(context, row)) {
    await writeRefusal(context, {
      channel: row?.channel ?? 'client',
      externalID: row?.external_id ?? unknownTokenID,
    });

    return null;
  }

  const lastSeenAt = await updateLastSeen(context, row);

  return {
    identityID: row.identity_id,
    channel: row.channel,
    scope: row.scope,
    label: row.label,
    pairedAt: row.paired_at,
    lastSeenAt,
  };
}

// A read-only caller writes nothing, not even its last seen time, and never lapses: the deployment
// config decides which tokens hold, so removing a hash there revokes its token.
function buildReadOnlyCaller(now: number): Identity {
  return {
    identityID: 'read-only-token',
    channel: 'client',
    scope: 'full',
    label: 'read-only token',
    pairedAt: now,
    lastSeenAt: now,
  };
}

type IdentityRow = APITables['identities'];

function readIdentityRow(context: APIContext, tokenHash: string): Promise<IdentityRow | undefined> {
  return context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('identities')
    .selectAll()
    .where('token_hash', '=', tokenHash)
    .executeTakeFirst();
}

function isLive(context: APIContext, row: IdentityRow): boolean {
  return (
    row.revoked_at === null &&
    context.clock.now() - row.last_seen_at <= context.settings.sessionIdleMs
  );
}

async function updateLastSeen(context: APIContext, row: IdentityRow): Promise<number> {
  const now = context.clock.now();

  if (now - row.last_seen_at < context.settings.lastSeenIntervalMs) {
    return row.last_seen_at;
  }

  await withWriteTransaction(context.log.writer, (tx) =>
    tx
      .$extendTables<APITables>()
      .updateTable('identities')
      .set({ last_seen_at: now })
      .where('identity_id', '=', row.identity_id)
      .where('last_seen_at', '<', now)
      .execute(),
  );

  return now;
}
