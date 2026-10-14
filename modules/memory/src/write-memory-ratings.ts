import type { JSONObject } from '@heynixie/log';
import { readRecords, withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { encodeRatingNote } from './encode-rating-note';
import { findItemIDs } from './find-item-ids';
import { findItemKey } from './find-item-key';
import { MemoryRatingError } from './memory-rating-error';
import type { MemoryRating, RateRequest } from './rating-types';
import { readShortIDs } from './read-short-ids';
import type { StoreParts } from './types';

// Keeps the model's ratings as one memory.rated record bound to the thread's latest recall, each at
// the newest version that recall delivered. A note is sealed under its item's key, and a refusal
// names an item only by its stored short ID, so a forget leaves no readable copy of either.
export async function writeMemoryRatings(parts: StoreParts, request: RateRequest): Promise<void> {
  const log = parts.context.log;
  const recall = await readLatestRecall(parts, request.thread);
  const items = await readRatedItems(parts, request.ratings);

  requireRatedOnce(request.ratings, items);
  requireRecalled(request.ratings, { ...items, versions: recall.versions });

  const ratingID = crypto.randomUUID();
  const ratings = await Promise.all(
    request.ratings.map((rating) =>
      buildRatingJSON(parts, { ...items, rating, ratingID, versions: recall.versions }),
    ),
  );

  await withWriteTransaction(log.writer, (tx) =>
    writeRecordsInTransaction(tx, log, [
      {
        kind: 'memory.rated',
        definitions: parts.context.definitions(),
        thread: request.thread,
        payload: {
          ratingID,
          recalledSequence: recall.sequence,
          runID: request.runID,
          ...(request.ratedBy === null ? {} : { ratedBy: request.ratedBy }),
          ratings,
        },
      },
    ]),
  );
}

interface LatestRecall {
  readonly sequence: number;

  // the newest version the recall delivered of each item, by item ID
  readonly versions: ReadonlyMap<string, number>;
}

async function readLatestRecall(parts: StoreParts, thread: string): Promise<LatestRecall> {
  const [newest] = await readRecords(parts.context.log, {
    afterSequence: 0,
    thread,
    kinds: ['memory.recalled'],
    order: 'newest',
    limit: 1,
  });

  if (newest === undefined) {
    throw new MemoryRatingError(
      'You have not been given any memories in this conversation yet, so there is nothing to rate.',
    );
  }
  const versions = new Map<string, number>();

  for (const item of recalledPayload.parse(newest.record.payload).items) {
    versions.set(item.itemID, Math.max(item.version, versions.get(item.itemID) ?? 0));
  }
  return { sequence: newest.record.sequence, versions };
}

const recalledItem = z.object({ itemID: z.string(), version: z.int() });

const recalledPayload = z.object({ items: z.array(recalledItem) });

// Each named item, by the item ID it names and the short ID the store holds for it. The model can
// pass any text as an item, so an item that names no memory is refused in fixed words, and every
// other refusal names an item by its stored short ID, never by what the model passed.
interface RatedItems {
  readonly found: ReadonlyMap<string, string>;
  readonly shortIDs: ReadonlyMap<string, string>;
}

async function readRatedItems(
  parts: StoreParts,
  ratings: readonly MemoryRating[],
): Promise<RatedItems> {
  const found = await findItemIDs(
    parts,
    ratings.map((rating) => rating.item),
  );

  if (ratings.some((rating) => !found.has(rating.item))) {
    throw new MemoryRatingError(
      'An item you rated is not the ID of a memory, so nothing was rated. Rate the memories by the IDs you were given.',
    );
  }
  return { found, shortIDs: await readShortIDs(parts, [...found.values()]) };
}

function getItemID(items: RatedItems, rating: MemoryRating): string {
  const itemID = items.found.get(rating.item);

  invariant(itemID !== undefined, 'readRatedItems checked the item');
  return itemID;
}

function getShortID(items: RatedItems, itemID: string): string {
  const shortID = items.shortIDs.get(itemID);

  invariant(shortID !== undefined, 'readShortIDs reads every item that exists');
  return shortID;
}

// An item rated twice in one call has no one verdict to keep, whether the model named it the same
// way twice or once by its short ID and once by its item ID.
function requireRatedOnce(ratings: readonly MemoryRating[], items: RatedItems): void {
  const seen = new Set<string>();

  for (const itemID of ratings.map((rating) => getItemID(items, rating))) {
    if (seen.has(itemID)) {
      throw new MemoryRatingError(
        `${getShortID(items, itemID)} is rated twice; rate each item once.`,
      );
    }
    seen.add(itemID);
  }
}

interface RecalledItems extends RatedItems {
  readonly versions: ReadonlyMap<string, number>;
}

// Refuses the whole call when any item is one the latest recall did not deliver, and names each.
function requireRecalled(ratings: readonly MemoryRating[], recalled: RecalledItems): void {
  const missing = ratings
    .map((rating) => getItemID(recalled, rating))
    .filter((itemID) => !recalled.versions.has(itemID));

  if (missing.length > 0) {
    throw new MemoryRatingError(
      missing
        .map(
          (itemID) =>
            `${getShortID(recalled, itemID)} was not among the memories you were given on the latest turn, so it can't be rated.`,
        )
        .join(' '),
    );
  }
}

interface RatingParts extends RecalledItems {
  readonly rating: MemoryRating;
  readonly ratingID: string;
}

// The rating as its record holds it: the item ID and version, never the ID the model passed, and a
// note only as the ciphertext under the item's key.
async function buildRatingJSON(parts: StoreParts, rating: RatingParts): Promise<JSONObject> {
  const itemID = getItemID(rating, rating.rating);
  const version = rating.versions.get(itemID);

  invariant(version !== undefined, 'requireRecalled checked the item');

  const base = { itemID, version, verdict: rating.rating.verdict };
  const note = rating.rating.note;

  return note === undefined || note === ''
    ? base
    : { ...base, sealedNote: await requireSealedNote(parts, rating, { itemID, note }) };
}

interface ItemNote {
  readonly itemID: string;
  readonly note: string;
}

// the note sealed under its item's key, which a forget since the recall has removed
async function requireSealedNote(
  parts: StoreParts,
  rating: RatingParts,
  note: ItemNote,
): Promise<string> {
  const key = await findItemKey(parts.context.log, note.itemID);

  if (key === null || key === undefined) {
    throw new MemoryRatingError(
      `${getShortID(rating, note.itemID)} was forgotten, so a note on it can't be kept.`,
    );
  }
  return encodeRatingNote(key, { ratingID: rating.ratingID, itemID: note.itemID }, note.note);
}
