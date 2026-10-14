import type { Projection } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { ConsolidationTables } from './consolidation-types';
import type { ConsolidationRecord } from './parse-consolidation-record';
import { parseConsolidationRecord } from './parse-consolidation-record';

// One row per consolidator run, a run that proposed no change included, so the schedule reads when
// the last run was, with the sealed summary its session left for you.
export const memoryConsolidationsProjection: Projection = {
  table: 'memory_consolidations',
  keyColumn: 'diff_id',
  fold: async (tx, record) => {
    const parsed = parseConsolidationRecord(record);
    const db = tx.$extendTables<ConsolidationTables>();

    if (parsed?.kind === 'memory.consolidation_summarized') {
      return updateRunSummary(db, parsed);
    }
    if (parsed?.kind !== 'memory.consolidation_proposed') {
      return [];
    }
    await db
      .insertInto('memory_consolidations')
      .values({
        diff_id: parsed.diffID,
        model: parsed.model,
        changes: parsed.changes.length,
        shown_items: parsed.shownItems,
        sequence: record.sequence,
        created_at: parsed.at,
        summary: null,
        summary_shares: null,
        summary_lapse_at: null,
      })
      .execute();
    return [parsed.diffID];
  },
};

// the summary, which the run's step commits right after the run's own record
async function updateRunSummary(
  db: Kysely<ConsolidationTables>,
  parsed: Extract<ConsolidationRecord, { kind: 'memory.consolidation_summarized' }>,
): Promise<readonly string[]> {
  await db
    .updateTable('memory_consolidations')
    .set({
      summary: parsed.sealed,
      summary_shares: JSON.stringify(parsed.shares),
      summary_lapse_at: parsed.lapseAt,
    })
    .where('diff_id', '=', parsed.diffID)
    .execute();
  return [parsed.diffID];
}
