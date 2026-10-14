import type { EnvelopeRecord, Projection } from '@heynixie/log';
import type { Kysely } from 'kysely';
import type { ConsolidationTables } from './consolidation-types';
import type { ConsolidationRecord } from './parse-consolidation-record';
import { parseConsolidationRecord } from './parse-consolidation-record';

// One row per change a consolidator diff proposes. A change waits as pending until your approval
// consumes it, your rejection closes it, or it lapses. Its text stays sealed under its first
// input's key, so a forget of that item leaves the change unreadable too.
export const memoryConsolidationChangesProjection: Projection = {
  table: 'memory_consolidation_changes',
  keyColumn: 'change_id',
  fold: (tx, record) => {
    const parsed = parseConsolidationRecord(record);

    if (parsed === null) {
      return Promise.resolve([]);
    }
    return writeChangeRows(tx.$extendTables<ConsolidationTables>(), record, parsed);
  },
};

async function writeChangeRows(
  db: Kysely<ConsolidationTables>,
  record: EnvelopeRecord,
  parsed: ConsolidationRecord,
): Promise<readonly string[]> {
  if (parsed.kind === 'memory.consolidation_proposed') {
    if (parsed.changes.length === 0) {
      return [];
    }
    await db
      .insertInto('memory_consolidation_changes')
      .values(
        parsed.changes.map((change, position) => ({
          change_id: change.changeID,
          diff_id: parsed.diffID,
          position,
          kind: change.kind,
          item_id: change.itemID,
          inputs: JSON.stringify(change.inputs),
          source: change.source,
          status: 'pending' as const,
          action_hash: change.actionHash,
          sealed: change.sealed,
          model: parsed.model,
          created_sequence: record.sequence,
          created_at: parsed.at,
          lapse_at: change.lapseAt,
          resolved_sequence: null,
        })),
      )
      .execute();
    return parsed.changes.map((change) => change.changeID);
  }
  await db
    .updateTable('memory_consolidation_changes')
    .set({ status: statusAfter[parsed.kind], resolved_sequence: record.sequence })
    .where('change_id', '=', parsed.changeID)
    .execute();
  return [parsed.changeID];
}

const statusAfter = {
  'memory.consolidation_approved': 'consumed',
  'memory.consolidation_rejected': 'rejected',
  'memory.consolidation_lapsed': 'lapsed',
} as const;
