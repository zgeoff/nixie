import type { Erasable, ErasureStart, WriteTransaction } from '@heynixie/log';
import { ErasureRefusedError } from '@heynixie/log';
import { readNoteForgetFloor } from '../forget/read-note-forget-floor';
import type { NoteIndex } from '../index/start-note-index';
import { readActiveNoteRow, readNoteRow } from '../note/read-note-row';
import type { NotebookContext } from '../types';
import { readLegacyOpenNoteForgets } from './read-legacy-open-note-forgets';
import { readNoteKeys } from './read-note-keys';

export interface NoteErasureRequest {
  // a short ID or a UUID
  readonly note: string;

  // the version the forget binds to; without it the forget takes the current version
  readonly version?: number | undefined;

  // refuses a UUID as an unknown note, for a caller that the model drives
  readonly isShortIDOnly?: boolean | undefined;

  // starts from a note that an earlier release's forget left in forgetting
  readonly isResuming?: boolean;
}

// The note's runner methods. A forget captures every key of the note's versions and links, drops
// the note from the index, and has no child.
export function buildNoteErasable(
  context: Pick<NotebookContext, 'log'>,
  index: NoteIndex,
): Erasable<NoteErasureRequest> {
  return {
    start: (tx, request) => startNoteErasure(tx, request),
    hide: (target) => index.drop(target.targetID),
    readChildren: () => Promise.resolve([]),
    toRequest: (target) => ({ note: target.targetID }),
    cleanIndexes: (target) => index.drop(target.targetID),
    readLegacyOpen: () => readLegacyOpenNoteForgets(context),
  };
}

async function startNoteErasure(
  tx: WriteTransaction,
  request: NoteErasureRequest,
): Promise<ErasureStart> {
  const row =
    request.isResuming === true
      ? await readResumingRow(tx, request.note)
      : await readActiveNoteRow(tx, request.note);

  if (row === null || (request.isShortIDOnly === true && row.short_id !== request.note)) {
    throw new ErasureRefusedError('not_found');
  }

  if (request.version !== undefined && row.version !== request.version) {
    throw new ErasureRefusedError('stale');
  }

  const floor = await readNoteForgetFloor(tx, row.note_id);

  return {
    target: { kind: 'note', targetID: row.note_id, version: row.version },
    shortID: row.short_id,
    capture: {
      keys: { ids: await readNoteKeys(tx, row.note_id) },
      cleanupKeys: [],
      sandboxCallIDs: [],
      purges: [],
      sessionCause: { noteID: row.note_id },

      // A note sits on no thread, so its forget names none and starts at the note's first record.
      turnInputs: { threads: [], cleaned: false, floor },
    },
  };
}

async function readResumingRow(tx: WriteTransaction, note: string) {
  const row = await readNoteRow(tx, note);

  return row?.state === 'forgetting' ? row : null;
}
