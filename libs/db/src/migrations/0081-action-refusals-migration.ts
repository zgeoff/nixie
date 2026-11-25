import { sql } from 'kysely';
import type { Transaction } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

const columns = [
  // the attempts of an action that the provider refused, which each take the action the next key
  { name: 'refused_count', definition: 'integer not null default 0' },

  // 1 for an action that a runner queued on its task's thread, with no call of a model behind it
  { name: 'is_runner', definition: 'integer not null default 0' },
] as const;

// The backfill reads each action's refusals from its records, as the actions projection folds them,
// so a rebuild of the projection gives the rows this migration leaves: each refusal counts once and
// clears the first attempt, and the next attempt to start sets it again.
export const actionRefusalsMigration: Migration = {
  name: 'count the refused attempts of each action and mark the actions that a runner queued',
  up: async (tx) => {
    for (const column of columns) {
      const present = await readQueryRows(
        sql`select name from pragma_table_info('actions') where name = ${column.name}`,
        tx,
        z.object({ name: z.string() }),
      );

      if (present.length === 0) {
        await sql`alter table actions add column ${sql.id(column.name)} ${sql.raw(column.definition)}`.execute(
          tx,
        );
      }
    }

    await writeRefusalBackfill(tx);
  },
};

const attemptRecordSchema = z.object({
  action_id: z.string(),
  kind: z.enum(['action.retry_scheduled', 'action.attempt_started']),
  recorded_at: z.int(),
});

async function writeRefusalBackfill(tx: Transaction<unknown>): Promise<void> {
  const records = await readQueryRows(
    sql`select json_extract(payload, '$.actionID') as action_id, kind, recorded_at
      from records
      where kind in ('action.retry_scheduled', 'action.attempt_started')
        and json_extract(payload, '$.actionID') is not null
      order by sequence`,
    tx,
    attemptRecordSchema,
  );

  for (const [actionID, backfill] of collectRefusalBackfills(records)) {
    await sql`update actions
      set refused_count = ${backfill.refusedCount}, first_attempt_at = ${backfill.firstAttemptAt}
      where action_id = ${actionID}`.execute(tx);
  }
}

type AttemptRecord = z.infer<typeof attemptRecordSchema>;

interface RefusalBackfill {
  readonly refusedCount: number;
  readonly firstAttemptAt: number | null;
}

// The count and first attempt of each action that a refusal touched, from its attempt records in
// order. An action with no refusal keeps the first attempt it has.
function collectRefusalBackfills(
  records: readonly AttemptRecord[],
): ReadonlyMap<string, RefusalBackfill> {
  const backfills = new Map<string, RefusalBackfill>();

  for (const record of records) {
    const earlier = backfills.get(record.action_id);

    if (record.kind === 'action.retry_scheduled') {
      backfills.set(record.action_id, {
        refusedCount: (earlier?.refusedCount ?? 0) + 1,
        firstAttemptAt: null,
      });
    } else if (earlier !== undefined && earlier.firstAttemptAt === null) {
      backfills.set(record.action_id, { ...earlier, firstAttemptAt: record.recorded_at });
    }
  }

  return backfills;
}
