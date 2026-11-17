import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { SpendTables } from '../types';

export interface TurnRecord {
  readonly sequence: number;
  readonly recordedAtMs: number;
}

const spendBucketMs = 15 * 60 * 1000;

// Adds one turn to its 15-minute bucket, and moves the folded sequence up to the turn's record, so a
// start counts only the turn records that no fold has counted.
export async function writeTurnBucket(tx: Transaction<unknown>, turn: TurnRecord): Promise<string> {
  const tables = tx.$extendTables<SpendTables>();
  const bucket = Math.floor(turn.recordedAtMs / spendBucketMs) * spendBucketMs;

  await tables
    .insertInto('spend_turns')
    .values({ bucket_start: bucket, turns: 1 })
    .onConflict((conflict) =>
      conflict.column('bucket_start').doUpdateSet({ turns: sql`turns + 1` }),
    )
    .execute();

  await tables
    .insertInto('spend_turns_folded')
    .values({ id: 1, through_sequence: turn.sequence })
    .onConflict((conflict) =>
      conflict
        .column('id')
        .doUpdateSet({ through_sequence: sql`max(through_sequence, ${turn.sequence})` }),
    )
    .execute();

  return String(bucket);
}
