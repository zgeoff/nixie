import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import type { WriteTransaction } from '@heynixie/log';
import type { NoteIndex } from '../index/start-note-index';
import { readActiveNoteRow } from '../note/read-note-row';
import { readNoteText } from '../note/read-note-text';
import type { ForgetBy } from '../record/forget-by-schema';
import { noteForgettingCodec } from '../record/note-forgetting-codec';
import type { NotebookContext } from '../types';
import { runNoteForgetCleanup } from './run-note-forget-cleanup';

export interface NoteForgetTarget {
  readonly note: string;

  // the version the forget binds to; without it the forget takes the current version
  readonly version?: number;

  // who forgets: the user by default
  readonly by?: ForgetBy;

  // refuses a UUID as an unknown note, for a caller that the model drives
  readonly isShortIDOnly?: boolean;
}

export type NoteForget =
  | {
      readonly status: 'forgotten';
      readonly noteID: string;
      readonly shortID: string;

      // the title of the version that the forget erased
      readonly title: string;
    }
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
  const begun = await beginNoteForget(context, target, writeInTransaction);

  if (begun.status === 'refused') {
    return begun;
  }

  await runNoteForgetCleanup(context, index, begun.noteID);

  return {
    status: 'forgotten',
    noteID: begun.noteID,
    shortID: begun.shortID,
    title: begun.title,
  };
}

export type BegunNoteForget =
  | {
      readonly status: 'begun';
      readonly noteID: string;
      readonly shortID: string;
      readonly title: string;
    }
  | { readonly status: 'refused'; readonly reason: 'not_found' | 'stale' };

// The first part alone, for a caller that runs inside a turn: the cleanup waits for every turn in
// flight to end, so a call that waited for the cleanup would wait for itself.
export async function beginNoteForget(
  context: NotebookContext,
  target: NoteForgetTarget,
  writeInTransaction?: (tx: WriteTransaction) => Promise<void>,
): Promise<BegunNoteForget> {
  const begun = await withWriteTransaction(context.log.writer, async (tx) => {
    await writeInTransaction?.(tx);

    const row = await readActiveNoteRow(tx, target.note);

    if (row === null || (target.isShortIDOnly === true && row.short_id !== target.note)) {
      throw new NoteForgetRefusedError('not_found');
    }

    if (target.version !== undefined && row.version !== target.version) {
      throw new NoteForgetRefusedError('stale');
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'notebook.note_forgetting',
        definitions: context.definitions(),
        payload: noteForgettingCodec.encode({
          note: row.note_id,
          version: row.version,
          by: target.by ?? 'user',
        }),
      },
    ]);

    // read in the same transaction, so the title is the one of the version the forget erases
    const text = await readNoteText(
      { deploymentKey: context.log.deploymentKey, writer: { ...context.log.writer, db: tx } },
      row.text_seq,
    );

    return { noteID: row.note_id, shortID: row.short_id, title: text?.title ?? '' };
  }).catch((error: unknown) => {
    if (error instanceof NoteForgetRefusedError) {
      return error;
    }

    throw error;
  });

  if (begun instanceof NoteForgetRefusedError) {
    return { status: 'refused', reason: begun.reason };
  }

  return { status: 'begun', ...begun };
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
