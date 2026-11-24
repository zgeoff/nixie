import type { ErasureBy, Log, LogTables } from '@heynixie/log';
import { sql } from 'kysely';
import type { MomentTables } from '../../utils/moment-context';
import type { MomentErasureRequest } from './build-moment-erasable';

// A moment that an earlier release's destroy left in destroying, with no erasure.started to finish
// it. The earlier release recorded no actor for a destroy, and only the owner could destroy.
export async function readLegacyOpenMomentDestroys(
  log: Pick<Log, 'writer'>,
): Promise<readonly { request: MomentErasureRequest; by: ErasureBy }[]> {
  const rows = await log.writer.db
    .$extendTables<MomentTables & LogTables>()
    .selectFrom('moments')
    .select(['moment_id', 'version'])
    .where('state', '=', 'destroying')
    .where((eb) =>
      eb.not(
        eb.exists(
          eb
            .selectFrom('records')
            .select('sequence')
            .where('kind', '=', 'erasure.started')
            .where(sql`json_extract(payload, '$.targetID')`, '=', sql`moments.moment_id`),
        ),
      ),
    )
    .orderBy('updated_sequence')
    .execute();

  return rows.map((row) => ({
    request: { momentID: row.moment_id, version: row.version, isResuming: true },
    by: 'user',
  }));
}
