import type { Projection } from '@heynixie/log';
import { erasureFinishedCodec, erasureStartedCodec } from '@heynixie/log';
import { noteEditedCodec } from '../record/note-edited-codec';
import { noteForgettingCodec } from '../record/note-forgetting-codec';
import { noteForgottenCodec } from '../record/note-forgotten-codec';
import { noteReadCodec } from '../record/note-read-codec';
import { noteWrittenCodec } from '../record/note-written-codec';
import { privateOpenedCodec } from '../record/private-opened-codec';
import type { NotebookTables } from '../types';

export const notebookNotesProjection: Projection = {
  table: 'notebook_notes',
  keyColumn: 'note_id',
  fold: async (tx, record) => {
    const db = tx.$extendTables<NotebookTables>();
    const at = record.recordedAt.getTime();

    if (record.kind === noteWrittenCodec.kind) {
      const written = noteWrittenCodec.decode(record.payload);

      await db
        .insertInto('notebook_notes')
        .values({
          note_id: written.note,
          short_id: written.shortID,
          state: 'active',
          version: 1,
          text_seq: record.sequence,
          is_private: written.isPrivate ? 1 : 0,
          created_at: at,
          edited_at: at,
          read_at: null,
          owner_opened_at: null,
        })
        .execute();

      return [written.note];
    }

    if (record.kind === noteEditedCodec.kind) {
      const edited = noteEditedCodec.decode(record.payload);

      await db
        .updateTable('notebook_notes')
        .set({
          version: edited.version,
          text_seq: record.sequence,
          is_private: edited.isPrivate ? 1 : 0,
          edited_at: at,
        })
        .where('note_id', '=', edited.note)
        .execute();

      return [edited.note];
    }

    if (record.kind === noteReadCodec.kind) {
      const read = noteReadCodec.decode(record.payload);

      await db
        .updateTable('notebook_notes')
        .set({ read_at: at })
        .where('note_id', '=', read.note)
        .execute();

      return [read.note];
    }

    if (record.kind === privateOpenedCodec.kind) {
      const opened = privateOpenedCodec.decode(record.payload);

      await db
        .updateTable('notebook_notes')
        .set({ owner_opened_at: at })
        .where('note_id', '=', opened.note)
        .execute();

      return [opened.note];
    }

    if (record.kind === noteForgettingCodec.kind) {
      const forgetting = noteForgettingCodec.decode(record.payload);

      await db
        .updateTable('notebook_notes')
        .set({ state: 'forgetting' })
        .where('note_id', '=', forgetting.note)
        .execute();

      return [forgetting.note];
    }

    if (record.kind === noteForgottenCodec.kind) {
      const forgotten = noteForgottenCodec.decode(record.payload);

      await db
        .updateTable('notebook_notes')
        .set({ state: 'forgotten' })
        .where('note_id', '=', forgotten.note)
        .execute();

      return [forgotten.note];
    }

    if (record.kind === erasureStartedCodec.kind) {
      const started = erasureStartedCodec.decode(record.payload);

      if (started.kind !== 'note') {
        return [];
      }

      await db
        .updateTable('notebook_notes')
        .set({ state: 'forgetting' })
        .where('note_id', '=', started.targetID)
        .execute();

      return [started.targetID];
    }

    if (record.kind === erasureFinishedCodec.kind) {
      const finished = erasureFinishedCodec.decode(record.payload);

      if (finished.kind !== 'note') {
        return [];
      }

      await db
        .updateTable('notebook_notes')
        .set({ state: 'forgotten' })
        .where('note_id', '=', finished.targetID)
        .execute();

      return [finished.targetID];
    }

    return [];
  },
};
