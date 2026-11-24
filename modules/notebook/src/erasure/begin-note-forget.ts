import type { ErasureBy, ErasureHandle, WriteTransaction } from '@heynixie/log';
import { readActiveNoteRow } from '../note/read-note-row';
import { readNoteText } from '../note/read-note-text';
import type { NotebookContext } from '../types';
import type { NoteErasureRequest } from './build-note-erasable';

export interface NoteForgetTarget {
  readonly note: string;

  // the version the forget binds to; without it the forget takes the current version
  readonly version?: number;

  // who forgets: the user by default
  readonly by?: ErasureBy;

  // refuses a UUID as an unknown note, for a caller that the model drives
  readonly isShortIDOnly?: boolean;
}

export type BegunNoteForget =
  | {
      readonly status: 'begun';
      readonly noteID: string;
      readonly shortID: string;

      // the title of the version that the forget erases
      readonly title: string;
    }
  | { readonly status: 'refused'; readonly reason: 'not_found' | 'stale' };

// The first part of a forget alone: one transaction runs the client action's hook, checks the
// version and writes erasure.started, and from then on no tool or read reaches the note. The caller
// finishes the rest, so a call that runs inside a turn never waits for the cleanup that waits for it.
export async function beginNoteForget(
  context: NotebookContext,
  erasure: ErasureHandle<NoteErasureRequest>,
  target: NoteForgetTarget,
  writeInTransaction?: (tx: WriteTransaction) => Promise<void>,
): Promise<BegunNoteForget> {
  const erased = { title: '' };

  const begun = await erasure.begin(
    { note: target.note, version: target.version, isShortIDOnly: target.isShortIDOnly },
    {
      by: target.by ?? 'user',
      writeInTransaction: async (tx) => {
        await writeInTransaction?.(tx);

        // read in the start transaction, so the title is the one of the version the forget erases
        const row = await readActiveNoteRow(tx, target.note);

        if (row !== null) {
          const text = await readNoteText(
            { deploymentKey: context.log.deploymentKey, writer: { ...context.log.writer, db: tx } },
            row.text_seq,
          );

          erased.title = text?.title ?? '';
        }
      },
    },
  );

  if (begun.status === 'refused') {
    return begun;
  }

  return {
    status: 'begun',
    noteID: begun.target.targetID,
    shortID: begun.shortID ?? '',
    title: erased.title,
  };
}
