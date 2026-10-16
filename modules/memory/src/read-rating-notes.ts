import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { decodeRatingNote } from './decode-rating-note';
import { findItemKey } from './find-item-key';
import { memoryRatedCodec } from './memory-rated-codec';

// One rated item's note, named by the sequence of its memory.rated record and the item's ID.
export interface RatingNoteRef {
  readonly sequence: number;
  readonly itemID: string;
}

// A note as a view shows it. A note whose item's key is gone reads as shredded, one whose key or
// ciphertext fails reads as unreadable, and a rating with no note, or no such rating, reads as
// missing.
export type RatingNoteResult = RatingNoteRef &
  (
    | { readonly status: 'readable'; readonly text: string }
    | { readonly status: 'shredded' | 'unreadable' | 'missing' }
  );

// Reads the notes of the named ratings, in the order named, so a view can show them beside the
// memories they rate. It delivers nothing to a task, so it writes no record.
export function readRatingNotes(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  refs: readonly RatingNoteRef[],
): Promise<readonly RatingNoteResult[]> {
  return Promise.all(refs.map((ref) => readRatingNote(log, ref)));
}

interface SealedNote {
  readonly ratingID: string;
  readonly itemID: string;
  readonly sealedNote: string;
}

async function readRatingNote(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  ref: RatingNoteRef,
): Promise<RatingNoteResult> {
  const sealed = await findSealedNote(log, ref);

  return sealed === null
    ? { sequence: ref.sequence, itemID: ref.itemID, status: 'missing' }
    : readSealedNote(log, ref, sealed);
}

// opens a note under its item's key, while the key exists
async function readSealedNote(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  ref: RatingNoteRef,
  sealed: SealedNote,
): Promise<RatingNoteResult> {
  const base = { sequence: ref.sequence, itemID: ref.itemID };

  const key = await findItemKey(log, ref.itemID);

  if (key === undefined) {
    return { ...base, status: 'shredded' };
  }

  if (key === null) {
    return { ...base, status: 'unreadable' };
  }

  try {
    const text = await decodeRatingNote(key, sealed, sealed.sealedNote);

    return { ...base, status: 'readable', text };
  } catch {
    return { ...base, status: 'unreadable' };
  }
}

// the note the rating record at the sequence holds for the item, or null when there is none
async function findSealedNote(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  ref: RatingNoteRef,
): Promise<SealedNote | null> {
  const [entry] = await readRecords(log, {
    afterSequence: ref.sequence - 1,
    beforeSequence: ref.sequence + 1,
    kinds: ['memory.rated'],
    limit: 1,
  });

  const payload =
    entry === undefined ? null : memoryRatedCodec.tryDecodePartial(entry.record.payload);

  const rating = payload?.ratings?.find((candidate) => candidate.itemID === ref.itemID);

  return payload?.ratingID === undefined || rating?.sealedNote === undefined
    ? null
    : { ratingID: payload.ratingID, itemID: ref.itemID, sealedNote: rating.sealedNote };
}
