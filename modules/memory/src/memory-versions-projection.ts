import type { Projection } from '@heynixie/log';
import { buildVersionKey } from './build-version-key';
import { parseMemoryRecord } from './parse-memory-record';
import type { MemoryTables } from './types';

// One row per version, appended and never changed. The text stays sealed under the item's key, and
// the provenance sits in plain columns that the fold copies from the record.
export const memoryVersionsProjection: Projection = {
  table: 'memory_versions',
  keyColumn: 'version_key',
  fold: async (tx, record) => {
    const parsed = parseMemoryRecord(record);

    if (parsed?.kind !== 'memory.version_added') {
      return [];
    }
    const versionKey = buildVersionKey(parsed);

    await tx
      .$extendTables<MemoryTables>()
      .insertInto('memory_versions')
      .values({
        version_key: versionKey,
        item_id: parsed.itemID,
        version: parsed.version,
        change: parsed.change,
        state: parsed.state,
        sealed: parsed.sealed,
        evidence: parsed.evidence === null ? null : JSON.stringify(parsed.evidence),
        intent_evidence:
          parsed.intentEvidence === null ? null : JSON.stringify(parsed.intentEvidence),
        origin: parsed.origin,
        source: parsed.source,
        task_id: parsed.taskID,
        proposal_id: parsed.proposalID,
        checks: parsed.checks === null ? null : JSON.stringify(parsed.checks),
        sequence: record.sequence,
        snapshot_hash: record.definitions.snapshotHash,
        recorded_at: record.recordedAt.getTime(),
      })
      .execute();
    return [versionKey];
  },
};
