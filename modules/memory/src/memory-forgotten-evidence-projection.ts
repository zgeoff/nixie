import type { Projection } from '@heynixie/log';
import { parseMemoryRecord } from './parse-memory-record';
import type { MemoryTables } from './types';

// One row per message that backed a version of a forgotten item, as the message's sequence and the
// item, with no text. A later write that cites one of these messages waits for review, so a forget
// never comes back through a fresh quote of the same words.
export const memoryForgottenEvidenceProjection: Projection = {
  table: 'memory_forgotten_evidence',
  keyColumn: 'evidence_key',
  fold: async (tx, record) => {
    const parsed = parseMemoryRecord(record);

    if (parsed?.kind !== 'memory.forget_started' || parsed.evidenceSequences.length === 0) {
      return [];
    }

    const rows = [...new Set(parsed.evidenceSequences)].map((sequence) => ({
      evidence_key: `${String(sequence)}/${parsed.itemID}`,
      record_sequence: sequence,
      item_id: parsed.itemID,
    }));

    await tx
      .$extendTables<MemoryTables>()
      .insertInto('memory_forgotten_evidence')
      .values(rows)
      .execute();

    return rows.map((row) => row.evidence_key);
  },
};
