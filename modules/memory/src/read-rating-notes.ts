import type { Log } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { decodeRatingNote } from './decode-rating-note';
import { memoryRatedCodec } from './memory-rated-codec';
import { readItemKey } from './read-item-key';

export interface RatingNoteRef {
  readonly sequence: number;
  readonly itemID: string;
}

export type RatingNoteResult = RatingNoteRef &
  (
    | { readonly status: 'readable'; readonly text: string }
    | { readonly status: 'shredded' | 'unreadable' | 'missing' }
  );

export function readRatingNotes(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  refs: readonly RatingNoteRef[],
): Promise<readonly RatingNoteResult[]> {
  return Promise.all(refs.map((ref) => readRatingNote(log, ref)));
}

async function readRatingNote(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  ref: RatingNoteRef,
): Promise<RatingNoteResult> {
  const sealed = await readSealedNote(log, ref);

  return sealed === null
    ? { sequence: ref.sequence, itemID: ref.itemID, status: 'missing' }
    : openSealedNote(log, ref, sealed);
}

interface SealedNote {
  readonly ratingID: string;
  readonly itemID: string;
  readonly sealedNote: string;
}

async function readSealedNote(
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

async function openSealedNote(
  log: Pick<Log, 'deploymentKey' | 'writer'>,
  ref: RatingNoteRef,
  sealed: SealedNote,
): Promise<RatingNoteResult> {
  const base = { sequence: ref.sequence, itemID: ref.itemID };

  const key = await readItemKey(log, ref.itemID);

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
