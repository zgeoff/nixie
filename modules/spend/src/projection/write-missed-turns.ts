import type { LogTables, Writer } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import type { SpendTables } from '../types';
import { spendTurnKinds } from './spend-turns-projection';
import { writeTurnBucket } from './write-turn-bucket';

const pageSize = 500;

// Counts each turn record written after the last one a fold counted: on the first start after the
// spend tables exist, every turn the log holds, and after a rollback, the turns the release before
// wrote with no fold. Returns how many it counted.
export function writeMissedTurns(writer: Writer): Promise<number> {
  return withWriteTransaction(writer, async (tx) => {
    const folded = await tx
      .$extendTables<SpendTables>()
      .selectFrom('spend_turns_folded')
      .select('through_sequence')
      .where('id', '=', 1)
      .executeTakeFirst();

    const cursor = { after: folded?.through_sequence ?? 0, counted: 0, isDone: false };

    while (!cursor.isDone) {
      const rows = await tx
        .$extendTables<LogTables>()
        .selectFrom('records')
        .select(['sequence', 'recorded_at'])
        .where('sequence', '>', cursor.after)
        .where('kind', 'in', spendTurnKinds)
        .orderBy('sequence')
        .limit(pageSize)
        .execute();

      for (const row of rows) {
        await writeTurnBucket(tx, { sequence: row.sequence, recordedAtMs: row.recorded_at });
      }

      cursor.after = rows.at(-1)?.sequence ?? cursor.after;
      cursor.counted += rows.length;
      cursor.isDone = rows.length < pageSize;
    }

    return cursor.counted;
  });
}
