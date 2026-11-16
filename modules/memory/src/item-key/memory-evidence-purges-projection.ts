import type { Projection } from '@heynixie/log';
import { memoryEvidencePurgeClosedCodec } from '../record/memory-evidence-purge-closed-codec';
import { memoryEvidencePurgeStartedCodec } from '../record/memory-evidence-purge-started-codec';
import { memoryEvidencePurgedCodec } from '../record/memory-evidence-purged-codec';
import type { MemoryTables } from '../types';
import { buildPurgeKey } from './build-purge-key';

export const memoryEvidencePurgesProjection: Projection = {
  table: 'memory_evidence_purges',
  keyColumn: 'purge_key',
  fold: async (tx, record) => {
    const db = tx.$extendTables<MemoryTables>();

    if (record.kind === memoryEvidencePurgeStartedCodec.kind) {
      const started = memoryEvidencePurgeStartedCodec.decode(record.payload);
      const recordSequence = started.recordSequence ?? record.sequence;
      const itemIDs = [...new Set(started.itemIDs)];

      if (itemIDs.length === 0) {
        return [];
      }

      const rows = itemIDs.map((itemID) => ({
        purge_key: buildPurgeKey(recordSequence, itemID),
        record_sequence: recordSequence,
        item_id: itemID,
        closed_sequence: null,
        purged_sequence: null,
        bridge_version: null,
        labels_revision: null,
      }));

      await db.insertInto('memory_evidence_purges').values(rows).execute();

      return rows.map((row) => row.purge_key);
    }

    if (record.kind === memoryEvidencePurgeClosedCodec.kind) {
      const closed = memoryEvidencePurgeClosedCodec.decode(record.payload);
      const purgeKey = buildPurgeKey(closed.recordSequence, closed.itemID);

      await db
        .updateTable('memory_evidence_purges')
        .set({
          closed_sequence: record.sequence,
          bridge_version: closed.bridgeVersion,
          labels_revision: closed.labelsRevision,
        })
        .where('purge_key', '=', purgeKey)
        .execute();

      return [purgeKey];
    }

    if (record.kind === memoryEvidencePurgedCodec.kind) {
      const purged = memoryEvidencePurgedCodec.decode(record.payload);
      const purgeKey = buildPurgeKey(purged.recordSequence, purged.itemID);

      await db
        .updateTable('memory_evidence_purges')
        .set({ purged_sequence: record.sequence })
        .where('purge_key', '=', purgeKey)
        .execute();

      return [purgeKey];
    }

    return [];
  },
};
