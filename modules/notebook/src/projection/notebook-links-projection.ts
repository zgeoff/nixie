import type { EnvelopeRecord, Projection } from '@heynixie/log';
import { erasureStartedCodec } from '@heynixie/log';
import { noteForgettingCodec } from '../record/note-forgetting-codec';
import { noteLinkedCodec } from '../record/note-linked-codec';
import { noteUnlinkedCodec } from '../record/note-unlinked-codec';
import type { NotebookTables } from '../types';
import { buildLinkKey, toTargetID, toTargetKind } from './build-link-key';

export const notebookLinksProjection: Projection = {
  table: 'notebook_links',
  keyColumn: 'link_key',
  fold: async (tx, record) => {
    const db = tx.$extendTables<NotebookTables>();

    if (record.kind === noteLinkedCodec.kind) {
      const linked = noteLinkedCodec.decode(record.payload);
      const linkKey = buildLinkKey(linked.from, linked.to, linked.type);

      await db
        .insertInto('notebook_links')
        .values({
          link_key: linkKey,
          from_note_id: linked.from,
          target_kind: toTargetKind(linked.to),
          target_id: toTargetID(linked.to),
          type: linked.type,
          reason_seq: record.sequence,
          created_at: record.recordedAt.getTime(),
        })
        .onConflict((conflict) =>
          conflict.column('link_key').doUpdateSet({ reason_seq: record.sequence }),
        )
        .execute();

      return [linkKey];
    }

    if (record.kind === noteUnlinkedCodec.kind) {
      const unlinked = noteUnlinkedCodec.decode(record.payload);
      const linkKey = buildLinkKey(unlinked.from, unlinked.to, unlinked.type);

      await db.deleteFrom('notebook_links').where('link_key', '=', linkKey).execute();

      return [linkKey];
    }

    // A forgotten note takes its own links with it; a link to it stays and reads as gone.
    const forgotten = pickForgottenNote(record);

    if (forgotten !== null) {
      const removed = await db
        .deleteFrom('notebook_links')
        .where('from_note_id', '=', forgotten)
        .returning('link_key')
        .execute();

      return removed.map((row) => row.link_key);
    }

    return [];
  },
};

function pickForgottenNote(record: EnvelopeRecord): string | null {
  if (record.kind === noteForgettingCodec.kind) {
    return noteForgettingCodec.decode(record.payload).note;
  }

  if (record.kind === erasureStartedCodec.kind) {
    const started = erasureStartedCodec.decode(record.payload);

    return started.kind === 'note' ? started.targetID : null;
  }

  return null;
}
