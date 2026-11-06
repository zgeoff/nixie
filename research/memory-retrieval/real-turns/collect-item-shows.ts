import type { TurnCase } from './build-turn-cases.ts';
import type { Gold } from './score-turns.ts';

export interface ItemShows {
  itemID: string;
  retrieved: number;
  pooled: number;
  helpful: number;
  misleading: number;
  held: number;
}

export interface ItemShowReport {
  items: ItemShows[];
  shownEntries: number;
  topShares: { top: number; share: number }[];
}

// An item retrieved on many turns and helpful on few is a hub.
export function collectItemShows(
  turns: TurnCase[],
  gold: Map<string, Gold>,
  pooledByCase: Map<string, Set<string>>,
  tops: number[],
): ItemShowReport {
  const shows = new Map<string, ItemShows>();
  const getEntry = (itemID: string): ItemShows => {
    const found = shows.get(itemID) ?? { itemID, retrieved: 0, pooled: 0, helpful: 0, misleading: 0, held: 0 };

    shows.set(itemID, found);

    return found;
  };

  for (const turn of turns) {
    for (const itemID of new Set(turn.logged.map((item) => item.itemID))) {
      getEntry(itemID).retrieved += 1;
    }
  }

  for (const [caseID, pooled] of pooledByCase) {
    const expected = gold.get(caseID);

    if (expected?.isLabelled !== true) {
      continue;
    }

    for (const itemID of pooled) {
      const entry = getEntry(itemID);

      entry.pooled += 1;
      entry.helpful += expected.relevant.has(itemID) ? 1 : 0;
      entry.misleading += expected.misleading.has(itemID) ? 1 : 0;
      entry.held += expected.delivered.has(itemID) ? 1 : 0;
    }
  }

  const items = [...shows.values()].toSorted((left, right) => right.retrieved - left.retrieved || right.pooled - left.pooled);
  const shownEntries = items.reduce((sum, entry) => sum + entry.retrieved, 0);

  return {
    items,
    shownEntries,
    topShares: tops.map((top) => ({
      top,
      share:
        shownEntries === 0
          ? 0
          : Math.round((items.slice(0, top).reduce((sum, entry) => sum + entry.retrieved, 0) / shownEntries) * 1000) / 1000,
    })),
  };
}
