import type { Projection } from '@heynixie/log';
import type { MemoryTables } from '../types';
import { readEvidenceSequences } from '../utils/read-evidence-sequences';
import { parseMemoryRecord } from '../utils/record/parse-memory-record';

export const memoryForgottenEvidenceProjection: Projection = {
  table: 'memory_forgotten_evidence',
  keyColumn: 'evidence_key',
  fold: async (tx, record) => {
    const parsed = parseMemoryRecord(record);
    const db = tx.$extendTables<MemoryTables>();

    // An erasure of an item records no evidence of its own, so the fold reads the item's quotes as
    // they stand when the erasure starts, which is what the old forget recorded.
    const itemID =
      parsed?.kind === 'memory.forget_started' || parsed?.kind === 'memory.erasure_started'
        ? parsed.itemID
        : null;

    if (parsed === null || itemID === null) {
      return [];
    }

    const sequences =
      parsed.kind === 'memory.forget_started'
        ? parsed.evidenceSequences
        : await readEvidenceSequences(db, itemID);

    if (sequences.length === 0) {
      return [];
    }

    const rows = [...new Set(sequences)].map((sequence) => ({
      evidence_key: `${String(sequence)}/${itemID}`,
      record_sequence: sequence,
      item_id: itemID,
    }));

    await db
      .insertInto('memory_forgotten_evidence')
      .values(rows)
      .onConflict((conflict) => conflict.column('evidence_key').doNothing())
      .execute();

    return rows.map((row) => row.evidence_key);
  },
};
