import type { Projection } from '@heynixie/log';
import { noteEditedCodec } from '../record/note-edited-codec';
import { noteWrittenCodec } from '../record/note-written-codec';
import type { NotebookTables } from '../types';

export const notebookVersionsProjection: Projection = {
  table: 'notebook_versions',
  keyColumn: 'seq',
  fold: async (tx, record) => {
    const db = tx.$extendTables<NotebookTables>();

    if (record.kind !== noteWrittenCodec.kind && record.kind !== noteEditedCodec.kind) {
      return [];
    }

    const version =
      record.kind === noteWrittenCodec.kind
        ? noteWrittenCodec.decode(record.payload)
        : noteEditedCodec.decode(record.payload);

    await db
      .insertInto('notebook_versions')
      .values({
        note_id: version.note,
        version: version.version,
        seq: record.sequence,
        writer: version.writer,
        model: version.model,
        chars: version.chars,
        created_at: record.recordedAt.getTime(),
      })
      .execute();

    return [String(record.sequence)];
  },
};
