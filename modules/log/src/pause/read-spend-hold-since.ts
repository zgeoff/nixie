import type { Kysely } from 'kysely';
import type { LogTables } from '../types';

// The recorded time of the record that held the task for a route or a provider whose stop stands,
// or null when no such stop holds it. A task held by both waits since the earlier hold.
export async function readSpendHoldSince(
  db: Kysely<unknown>,
  taskID: string,
): Promise<number | null> {
  const route = await db
    .$extendTables<LogTables>()
    .selectFrom('spend_route_holds')
    .innerJoin('spend_route_stops', 'spend_route_stops.route_id', 'spend_route_holds.route_id')
    .innerJoin('records', 'records.sequence', 'spend_route_holds.updated_sequence')
    .select('records.recorded_at')
    .where('spend_route_holds.task_id', '=', taskID)
    .executeTakeFirst();

  const provider = await db
    .$extendTables<LogTables>()
    .selectFrom('spend_provider_holds')
    .innerJoin(
      'spend_provider_stops',
      'spend_provider_stops.provider_id',
      'spend_provider_holds.provider_id',
    )
    .innerJoin('records', 'records.sequence', 'spend_provider_holds.updated_sequence')
    .select('records.recorded_at')
    .where('spend_provider_holds.task_id', '=', taskID)
    .executeTakeFirst();

  const times = [route?.recorded_at, provider?.recorded_at].filter((time) => time !== undefined);

  return times.length === 0 ? null : Math.min(...times);
}
