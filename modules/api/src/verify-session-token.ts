import { withWriteTransaction } from '@heynixie/log';
import { deriveSecretHash } from './derive-secret-hash';
import type { APIContext, APITables, Identity } from './types';
import { writeRefusal } from './write-refusal';

// Resolves a device session token to its row of the identity record, or null. A revoked or lapsed
// session is refused under its session's ID. Every token nixie never issued shares one external ID,
// so a stranger with fresh random tokens still gets one refusal an interval.
export async function verifySessionToken(
  context: APIContext,
  token: string | undefined,
): Promise<Identity | null> {
  if (token === undefined || token === '') {
    return null;
  }

  const tokenHash = deriveSecretHash(token);

  const row = await findIdentityRow(context, tokenHash);

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
    label: row.label,
    pairedAt: row.paired_at,
    lastSeenAt,
  };
}

// the external ID of every token nixie never issued, which no session ID can equal
const unknownTokenID = 'unknown-token';

type IdentityRow = APITables['identities'];

function findIdentityRow(context: APIContext, tokenHash: string): Promise<IdentityRow | undefined> {
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

// the last seen time moves at most once per interval, so a busy client does not write on every call
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
