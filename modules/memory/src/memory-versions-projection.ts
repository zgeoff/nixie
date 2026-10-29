import type { Projection } from '@heynixie/log';
import { buildVersionKey } from './build-version-key';
import { parseMemoryRecord } from './parse-memory-record';
import { parseSubjectRecord } from './parse-subject-record';
import type { MemoryTables } from './types';

export const memoryVersionsProjection: Projection = {
  table: 'memory_versions',
  keyColumn: 'version_key',
  fold: async (tx, record) => {
    const changed = parseSubjectRecord(record);

    if (changed?.target === 'item_change') {
      const changedKey = buildVersionKey(changed);

      await tx
        .$extendTables<MemoryTables>()
        .updateTable('memory_versions')
        .set({ previous_subject: changed.previousSubject })
        .where('version_key', '=', changedKey)
        .execute();

      return [changedKey];
    }

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
        model: parsed.model,
        until: parsed.until,
        previous_subject: null,
        sequence: record.sequence,
        snapshot_hash: record.definitions.snapshotHash,
        recorded_at: record.recordedAt.getTime(),
      })
      .execute();

    return [versionKey];
  },
};
