import { withWriteTransaction, writeRecordsInTransaction } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { memoryRatedCodec } from './memory-rated-codec';
import { MemoryRatingError } from './memory-rating-error';
import type { MemoryRating, RateRequest } from './rating-types';
import { readItemIDMap } from './read-item-id-map';
import { readLatestRecall } from './read-latest-recall';
import { readShortIDs } from './read-short-ids';
import { requireSealedNote } from './require-sealed-note';
import type { StoreParts } from './types';

export async function writeMemoryRatings(parts: StoreParts, request: RateRequest): Promise<void> {
  const log = parts.context.log;

  const recall = await readLatestRecall(parts, request.thread);
  const items = await readRatedItems(parts, request.ratings);

  requireRatedOnce(request.ratings, items);
  requireRecalled(request.ratings, { ...items, versions: recall.versions });

  const ratingID = crypto.randomUUID();

  const ratings = await Promise.all(
    request.ratings.map((rating) =>
      sealRatingJSON(parts, { ...items, rating, ratingID, versions: recall.versions }),
    ),
  );

  await withWriteTransaction(log.writer, (tx) =>
    writeRecordsInTransaction(tx, log, [
      {
        kind: memoryRatedCodec.kind,
        definitions: parts.context.definitions(),
        thread: request.thread,
        payload: memoryRatedCodec.encode({
          ratingID,
          recalledSequence: recall.sequence,
          runID: request.runID,
          ...(request.ratedBy === null ? {} : { ratedBy: request.ratedBy }),
          ratings,
        }),
      },
    ]),
  );
}

interface RatedItems {
  readonly found: ReadonlyMap<string, string>;
  readonly shortIDs: ReadonlyMap<string, string>;
}

async function readRatedItems(
  parts: StoreParts,
  ratings: readonly MemoryRating[],
): Promise<RatedItems> {
  const found = await readItemIDMap(
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

interface RecalledItems extends RatedItems {
  readonly versions: ReadonlyMap<string, number>;
}

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

type Rating = ReturnType<typeof memoryRatedCodec.decode>['ratings'][number];

async function sealRatingJSON(parts: StoreParts, rating: RatingParts): Promise<Rating> {
  const itemID = getItemID(rating, rating.rating);
  const version = rating.versions.get(itemID);

  invariant(version !== undefined, 'requireRecalled checked the item');

  const base = { itemID, version, verdict: rating.rating.verdict };
  const note = rating.rating.note;

  if (note === undefined || note === '') {
    return base;
  }

  const sealedNote = await requireSealedNote(parts.context.log, {
    ratingID: rating.ratingID,
    itemID,
    shortID: getShortID(rating, itemID),
    note,
  });

  return { ...base, sealedNote };
}
