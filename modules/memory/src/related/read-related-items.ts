import { readDeliverableItems } from '../item/read-deliverable-items';
import { defaultTurnSettings } from '../turn/default-turn-settings';
import type { StoreParts } from '../types';
import { readRankedMatches } from '../view/read-ranked-matches';

const relatedItemLimit = 3;

export interface RelatedItem {
  readonly shortID: string;
  readonly text: string;
}

// The active items closest to the text, at most 3, under the floors of per-turn retrieval. It
// writes no recalled record, so a lookup counts for no item. A retired or forgotten item never
// shows, and a lapsed item reads as retired.
export async function readRelatedItems(
  parts: StoreParts,
  text: string,
): Promise<readonly RelatedItem[]> {
  const trigger = (parts.context.turn ?? defaultTurnSettings).trigger;

  // An item that is not active drops out below, so the search reads a page of spare matches.
  const ranked = await readRankedMatches(parts, {
    query: text,
    limit: relatedItemLimit * 4,
    excludedIDs: [],
    minScore: trigger.minScore,
    minSimilarity: trigger.minSimilarity,
  });

  return parts.lock(async () => {
    const delivered = await readDeliverableItems(parts, {
      itemIDs: ranked.matches.map((match) => match.itemID),
      states: ['active'],
      includeHistory: false,
    });

    const byID = new Map(delivered.map((item) => [item.itemID, item]));

    return ranked.matches
      .flatMap((match) => byID.get(match.itemID) ?? [])
      .slice(0, relatedItemLimit)
      .map((item) => ({ shortID: item.shortID, text: item.text }));
  });
}
