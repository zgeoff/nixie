import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { countCodePoints } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import type { NoteIndex } from '../index/start-note-index';
import type { NoteRefusal } from '../note/note-refusal';
import { buildRefusal } from '../note/note-refusal';
import type { EditInput } from '../note/plan-edit';
import { planEdit } from '../note/plan-edit';
import { readActiveNoteRow } from '../note/read-note-row';
import { readNoteText } from '../note/read-note-text';
import { noteEditedCodec } from '../record/note-edited-codec';
import type { NoteWriter, NotebookContext } from '../types';

export type NoteEdit =
  | {
      readonly status: 'written';
      readonly noteID: string;
      readonly shortID: string;
      readonly version: number;
    }
  | { readonly status: 'refused'; readonly refusal: NoteRefusal };

export interface EditRequest {
  readonly note: string;
  readonly input: EditInput;
}

// The version check and the record commit in one transaction, so an edit binds to the version it
// read, and 2 appends to one note never refuse each other.
export async function writeNoteEdit(
  context: NotebookContext,
  index: NoteIndex,
  caller: NoteWriter,
  request: EditRequest,
): Promise<NoteEdit> {
  const note = request.note;
  const input = request.input;
  const pending: { put: (() => Promise<void>) | null } = { put: null };

  const edit = await withWriteTransaction(context.log.writer, async (tx): Promise<NoteEdit> => {
    const row = await readActiveNoteRow(tx, note);

    const text =
      row === null
        ? null
        : await readNoteText(
            { deploymentKey: context.log.deploymentKey, writer: { ...context.log.writer, db: tx } },
            row.text_seq,
          );

    if (row === null || text === null) {
      return {
        status: 'refused',
        refusal: buildRefusal('UNKNOWN_NOTE', `no note has the ID ${note}`),
      };
    }

    const plan = planEdit(
      {
        shortID: row.short_id,
        version: row.version,
        title: text.title,
        body: text.body,
        tags: text.tags,
        isPrivate: row.is_private === 1,
      },
      input,
      context.settings.noteChars,
    );

    if (plan.kind === 'refused') {
      return { status: 'refused', refusal: plan.refusal };
    }

    const version = row.version + 1;

    const [record] = await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'notebook.note_edited',
        definitions: context.definitions(),
        payload: noteEditedCodec.encode({
          note: row.note_id,
          version,
          chars: countCodePoints(plan.body),
          writer: caller.writer,
          model: caller.model,
          isPrivate: plan.isPrivate,
        }),
        erasable: { title: plan.title, body: plan.body, tags: [...plan.tags] },
      },
    ]);

    invariant(record, 'the log wrote no record for the edit');

    pending.put = () =>
      index.put(
        {
          noteID: row.note_id,
          shortID: row.short_id,
          title: plan.title,
          tags: plan.tags,
          version,
          editedAt: record.recordedAt.getTime(),
          isPrivate: plan.isPrivate,
          textSeq: record.sequence,
        },
        plan.body,
      );

    return { status: 'written', noteID: row.note_id, shortID: row.short_id, version };
  });

  await pending.put?.();

  return edit;
}
