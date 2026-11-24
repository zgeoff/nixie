import { readDeliverableItems } from '../item/read-deliverable-items';
import { defaultTurnSettings } from '../turn/default-turn-settings';
import type { StoreParts } from '../types';
import { readRankedMatches } from '../view/read-ranked-matches';

const relatedItemLimit = 3;
const pageSize = 12;

export interface RelatedItem {
  readonly shortID: string;
  readonly text: string;
}

// The active items closest to the text, at most 3, under the floors of per-turn retrieval. It
// writes no recalled record. It reads the next page of matches until 3 active items are found, so
// a retired, lapsed or forgotten item never uses up a place.
export async function readRelatedItems(
  parts: StoreParts,
  text: string,
): Promise<readonly RelatedItem[]> {
  const trigger = (parts.context.turn ?? defaultTurnSettings).trigger;
  const seenIDs: string[] = [];
  const found: RelatedItem[] = [];

  while (found.length < relatedItemLimit) {
    const ranked = await readRankedMatches(parts, {
      query: text,
      limit: pageSize,
      excludedIDs: seenIDs,
      minScore: trigger.minScore,
      minSimilarity: trigger.minSimilarity,
    });

    const matchIDs = ranked.matches.map((match) => match.itemID);

    seenIDs.push(...matchIDs);
    found.push(...(await readActiveItems(parts, matchIDs)));

    if (matchIDs.length < pageSize) {
      break;
    }
  }

  return found.slice(0, relatedItemLimit);
}

function readActiveItems(
  parts: StoreParts,
  itemIDs: readonly string[],
): Promise<readonly RelatedItem[]> {
  return parts.lock(async () => {
    const delivered = await readDeliverableItems(parts, {
      itemIDs,
      states: ['active'],
      includeHistory: false,
    });

    const byID = new Map(delivered.map((item) => [item.itemID, item]));

    return itemIDs
      .flatMap((itemID) => byID.get(itemID) ?? [])
      .map((item) => ({ shortID: item.shortID, text: item.text }));
  });
}
