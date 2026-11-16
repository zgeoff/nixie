import type { Projection } from '@heynixie/log';
import { memoryEvidencePurgeClosedCodec } from '../record/memory-evidence-purge-closed-codec';
import { memoryVersionKeyedCodec } from '../record/memory-version-keyed-codec';
import type { MemoryTables } from '../types';

export const memoryItemKeysProjection: Projection = {
  table: 'memory_item_keys',
  keyColumn: 'key_id',
  fold: async (tx, record) => {
    const db = tx.$extendTables<MemoryTables>();

    if (record.kind === memoryVersionKeyedCodec.kind) {
      const keyed = memoryVersionKeyedCodec.decode(record.payload);

      await db
        .insertInto('memory_item_keys')
        .values({
          key_id: keyed.keyID,
          item_id: keyed.itemID,
          kind: 'version',
          version: keyed.version,
          sealed_evidence_quote: keyed.evidenceQuote,
          sealed_intent_quote: keyed.intentQuote,
          from_sequence: record.sequence,
          removed_sequence: null,
        })
        .execute();

      return [keyed.keyID];
    }

    if (record.kind !== memoryEvidencePurgeClosedCodec.kind) {
      return [];
    }

    const closed = memoryEvidencePurgeClosedCodec.decode(record.payload);
    const touched: string[] = [];

    for (const keyID of closed.closedKeyIDs) {
      const marked = await db
        .updateTable('memory_item_keys')
        .set({ removed_sequence: record.sequence })
        .where('key_id', '=', keyID)
        .executeTakeFirst();

      // generation 0 has no row until the record that deletes it
      if (marked.numUpdatedRows === 0n) {
        await db
          .insertInto('memory_item_keys')
          .values({
            key_id: keyID,
            item_id: closed.itemID,
            kind: 'generation',
            version: null,
            sealed_evidence_quote: null,
            sealed_intent_quote: null,
            from_sequence: 0,
            removed_sequence: record.sequence,
          })
          .execute();
      }

      touched.push(keyID);
    }

    if (closed.generationKeyID !== null) {
      await db
        .insertInto('memory_item_keys')
        .values({
          key_id: closed.generationKeyID,
          item_id: closed.itemID,
          kind: 'generation',
          version: null,
          sealed_evidence_quote: null,
          sealed_intent_quote: null,
          from_sequence: record.sequence,
          removed_sequence: null,
        })
        .execute();

      touched.push(closed.generationKeyID);
    }

    return touched;
  },
};
