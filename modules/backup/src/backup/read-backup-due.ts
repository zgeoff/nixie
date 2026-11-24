import type { LegacyEnd } from '@heynixie/log';
import { sql } from 'kysely';
import type { BackupTables, BackupWriter } from '../types';

export interface BackupDue {
  readonly isForgetDue: boolean;
  readonly isSetWaiting: boolean;
  readonly newestStagedAt: number | null;
}

// An erasure and each forget of an older pipeline delete their keys before they write their closing
// record, so a set whose copy started after that record lacks the key. A failed set counts too, so
// a backend that stays down fails one set per interval rather than one per pass.
export async function readBackupDue(
  writer: BackupWriter,
  legacyEnds: readonly LegacyEnd[],
): Promise<BackupDue> {
  const db = writer.db.$extendTables<BackupTables>();

  const newest = await db
    .selectFrom('backup_sets')
    .select((eb) => [eb.fn.max('log_head').as('log_head'), eb.fn.max('staged_at').as('staged_at')])
    .where('state', 'in', ['staged', 'published', 'failed'])
    .executeTakeFirst();

  const waiting = await db
    .selectFrom('backup_sets')
    .select('sequence')
    .where('state', '=', 'staged')
    .executeTakeFirst();

  const forgotten = await db
    .selectFrom('records')
    .select('sequence')
    .where((eb) =>
      eb.or([
        eb('kind', '=', 'erasure.finished'),
        ...legacyEnds.map((end) =>
          eb.and([
            eb('kind', '=', end.kind),
            ...Object.entries(end.where ?? {}).map(([field, value]) =>
              eb(sql`json_extract(payload, ${`$.${field}`})`, '=', value),
            ),
          ]),
        ),
      ]),
    )
    .where('sequence', '>', newest?.log_head ?? 0)
    .executeTakeFirst();

  return {
    isForgetDue: forgotten !== undefined,
    isSetWaiting: waiting !== undefined,
    newestStagedAt: newest?.staged_at ?? null,
  };
}
