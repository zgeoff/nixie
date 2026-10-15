import type { ConsolidationSchedule, ConsolidationTables } from './consolidation-types';
import type { StoreParts } from './types';

// Reads when the consolidator last ran, and how many of its changes still wait for your answer
// with the earliest time one lapses.
export async function readConsolidationSchedule(parts: StoreParts): Promise<ConsolidationSchedule> {
  const db = parts.context.log.writer.db.$extendTables<ConsolidationTables>();

  const last = await db
    .selectFrom('memory_consolidations')
    .select((eb) => eb.fn.max('created_at').as('at'))
    .executeTakeFirst();

  const pending = await db
    .selectFrom('memory_consolidation_changes')
    .select((eb) => [eb.fn.countAll<number>().as('count'), eb.fn.min('lapse_at').as('lapse')])
    .where('status', '=', 'pending')
    .where('lapse_at', '>', parts.context.gate.clock.now())
    .executeTakeFirst();

  return {
    lastRunAt: last?.at ?? null,
    pending: pending?.count ?? 0,
    nextLapseAt: pending?.lapse ?? null,
  };
}
