import { findRankedMatches } from './find-ranked-matches';
import type { MatchScores } from './merge-rankings';
import { readViewItems } from './read-view-items';
import type { StoreParts } from './types';
import type { ViewItem, ViewMatch, ViewMatches } from './view-types';

// Finds the active items whose text matches a query, ranked as a recall ranks them, and reads each
// as the memory view lists it. An item that left the active state after the ranking is left out.
export async function findViewMatches(parts: StoreParts, query: string): Promise<ViewMatches> {
  const ranked = await findRankedMatches(parts, { query, limit: matchLimit, excludedIDs: [] });

  const items = await readViewItems(
    parts.context.log,
    ranked.matches.map((match) => match.itemID),
  );

  const scores = new Map(ranked.matches.map((match) => [match.itemID, match]));

  return {
    items: items
      .filter((item) => item.state === 'active')
      .map((item) => buildViewMatch(item, scores.get(item.itemID))),
    searchMode: ranked.searchMode,
  };
}

// an item with each score an index gave it, leaving out an index that did not place it
function buildViewMatch(item: ViewItem, match: MatchScores | undefined): ViewMatch {
  return {
    ...item,
    ...(match?.score === undefined ? {} : { score: match.score }),
    ...(match?.similarity === undefined ? {} : { similarity: match.similarity }),
  };
}

// the most matches one search shows, as many as one recall delivers
const matchLimit = 100;
