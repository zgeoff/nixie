import type { ContractOutputs } from '@heynixie/contract';
import type { APIContext, APITables, Identity } from './types';

type Session = ContractOutputs['sessions']['list']['sessions'][number];

export async function readSessions(
  context: APIContext,
  caller: Identity | null,
): Promise<readonly Session[]> {
  const rows = await context.log.writer.db
    .$extendTables<APITables>()
    .selectFrom('identities')
    .select(['identity_id', 'label', 'paired_at', 'last_seen_at'])
    .where('channel', '=', 'client')
    .where('revoked_at', 'is', null)
    .where('last_seen_at', '>=', context.clock.now() - context.settings.sessionIdleMs)
    .orderBy('paired_at')
    .orderBy('identity_id')
    .execute();

  return rows.map((row) => ({
    createdAt: new Date(row.paired_at),
    current: row.identity_id === caller?.identityID,
    deviceName: row.label,
    lastUsedAt: new Date(row.last_seen_at),
    sessionID: row.identity_id,
  }));
}
