import { createShortID } from '@heynixie/db';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { countCodePoints } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import type { NoteIndex } from '../index/start-note-index';
import { mergeTags } from '../note/merge-tags';
import type { NoteRefusal } from '../note/note-refusal';
import { buildRefusal } from '../note/note-refusal';
import { noteWrittenCodec } from '../record/note-written-codec';
import type { NoteWriter, NotebookContext, NotebookTables } from '../types';

export interface WriteNoteInput {
  readonly title: string;
  readonly body: string;
  readonly tags?: readonly string[];
  readonly isPrivate?: boolean;
}

export type NoteWrite =
  | {
      readonly status: 'written';
      readonly noteID: string;
      readonly shortID: string;
      readonly version: 1;
    }
  | { readonly status: 'refused'; readonly refusal: NoteRefusal };

// NOTE_TOO_LONG, then NOTEBOOK_FULL. The count and the record commit in one transaction, so 2
// writes never fill the notebook past its limit.
export async function writeNote(
  context: NotebookContext,
  index: NoteIndex,
  caller: NoteWriter,
  input: WriteNoteInput,
): Promise<NoteWrite> {
  const chars = countCodePoints(input.body);

  if (chars > context.settings.noteChars) {
    return {
      status: 'refused',
      refusal: buildRefusal(
        'NOTE_TOO_LONG',
        `the body is ${String(chars)} characters, past the limit of ${String(context.settings.noteChars)}; split it into notes linked part-of`,
      ),
    };
  }

  const tags = mergeTags(input.tags ?? []);
  const isPrivate = input.isPrivate ?? false;

  const written = await withWriteTransaction(context.log.writer, async (tx) => {
    const active = await tx
      .$extendTables<NotebookTables>()
      .selectFrom('notebook_notes')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('state', '=', 'active')
      .executeTakeFirstOrThrow();

    if (active.count >= context.settings.maxNotes) {
      return null;
    }

    const noteID = crypto.randomUUID();
    const shortID = createShortID();

    const [record] = await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'notebook.note_written',
        definitions: context.definitions(),
        payload: noteWrittenCodec.encode({
          note: noteID,
          shortID,
          version: 1,
          writer: caller.writer,
          model: caller.model,
          chars,
          isPrivate,
        }),
        erasable: { title: input.title, body: input.body, tags: [...tags] },
      },
    ]);

    invariant(record, 'the log wrote no record for the note');

    return { noteID, shortID, sequence: record.sequence, at: record.recordedAt.getTime() };
  });

  if (written === null) {
    return {
      status: 'refused',
      refusal: buildRefusal(
        'NOTEBOOK_FULL',
        `the notebook holds ${String(context.settings.maxNotes)} notes; edit or link an existing one`,
      ),
    };
  }

  await index.put(
    {
      noteID: written.noteID,
      shortID: written.shortID,
      title: input.title,
      tags,
      version: 1,
      editedAt: written.at,
      isPrivate,
      textSeq: written.sequence,
    },
    input.body,
  );

  return { status: 'written', noteID: written.noteID, shortID: written.shortID, version: 1 };
}
