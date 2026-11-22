import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { WriteTransaction } from '@heynixie/log';
import type { NoteIndex } from '../index/start-note-index';
import { readActiveNoteRow } from '../note/read-note-row';
import { noteForgettingCodec } from '../record/note-forgetting-codec';
import type { NotebookContext } from '../types';
import { runNoteForgetCleanup } from './run-note-forget-cleanup';

export interface NoteForgetTarget {
  readonly note: string;
  readonly version: number;
}

export type NoteForget =
  | { readonly status: 'forgotten'; readonly noteID: string; readonly shortID: string }
  | { readonly status: 'refused'; readonly reason: 'not_found' | 'stale' };

// A forget in 2 parts. One transaction runs the client action's hook, checks the version and
// appends notebook.note_forgetting, and from then on no tool or read reaches the note. The cleanup
// follows.
export async function runNoteForget(
  context: NotebookContext,
  index: NoteIndex,
  target: NoteForgetTarget,
  writeInTransaction?: (tx: WriteTransaction) => Promise<void>,
): Promise<NoteForget> {
  const begun = await withWriteTransaction(context.log.writer, async (tx) => {
    await writeInTransaction?.(tx);

    const row = await readActiveNoteRow(tx, target.note);

    if (row === null) {
      throw new NoteForgetRefusedError('not_found');
    }

    if (row.version !== target.version) {
      throw new NoteForgetRefusedError('stale');
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'notebook.note_forgetting',
        definitions: context.definitions(),
        payload: noteForgettingCodec.encode({ note: row.note_id, version: row.version }),
      },
    ]);

    return { noteID: row.note_id, shortID: row.short_id };
  }).catch((error: unknown) => {
    if (error instanceof NoteForgetRefusedError) {
      return error;
    }

    throw error;
  });

  if (begun instanceof NoteForgetRefusedError) {
    return { status: 'refused', reason: begun.reason };
  }

  await runNoteForgetCleanup(context, index, begun.noteID);

  return { status: 'forgotten', ...begun };
}

// A refusal throws inside the transaction, so a client action written by the hook rolls back with it.
class NoteForgetRefusedError extends Error {
  override readonly name = 'NoteForgetRefusedError';

  readonly reason: 'not_found' | 'stale';

  constructor(reason: 'not_found' | 'stale') {
    super(`the note forget is refused as ${reason}`);

    this.reason = reason;
  }
}
