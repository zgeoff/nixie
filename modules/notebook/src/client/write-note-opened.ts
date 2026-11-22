import type { WriteTransaction } from '@heynixie/log';
import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import { readActiveNoteRow } from '../note/read-note-row';
import { privateOpenedCodec } from '../record/private-opened-codec';
import type { NotebookContext } from '../types';

export type NoteOpened =
  | { readonly status: 'opened'; readonly noteID: string; readonly shortID: string }
  | { readonly status: 'refused'; readonly reason: 'unknown' | 'not_private' };

// Appends the one notebook.private_opened record, in the transaction of the client's checked
// action, so a refetch or a retry never moves the mark. Opening a note that is not private writes
// nothing.
export async function writeNoteOpened(
  context: NotebookContext,
  note: string,
  writeInTransaction?: (tx: WriteTransaction) => Promise<void>,
): Promise<NoteOpened> {
  try {
    return await runNoteOpen(context, note, writeInTransaction);
  } catch (error) {
    if (error instanceof NoteOpenRefusedError) {
      return { status: 'refused', reason: error.reason };
    }

    throw error;
  }
}

function runNoteOpen(
  context: NotebookContext,
  note: string,
  writeInTransaction: ((tx: WriteTransaction) => Promise<void>) | undefined,
): Promise<NoteOpened> {
  return withWriteTransaction(context.log.writer, async (tx): Promise<NoteOpened> => {
    await writeInTransaction?.(tx);

    const row = await readActiveNoteRow(tx, note);

    if (row === null) {
      throw new NoteOpenRefusedError('unknown');
    }

    if (row.is_private !== 1) {
      throw new NoteOpenRefusedError('not_private');
    }

    await writeRecordsInTransaction(tx, context.log, [
      {
        kind: 'notebook.private_opened',
        definitions: context.definitions(),
        payload: privateOpenedCodec.encode({ note: row.note_id }),
      },
    ]);

    return { status: 'opened', noteID: row.note_id, shortID: row.short_id };
  });
}

// A refusal throws inside the transaction, so a client action written by the hook rolls back with it.
class NoteOpenRefusedError extends Error {
  override readonly name = 'NoteOpenRefusedError';

  readonly reason: 'unknown' | 'not_private';

  constructor(reason: 'unknown' | 'not_private') {
    super(`the open of a private note is refused as ${reason}`);

    this.reason = reason;
  }
}
