import type { MatchScores } from './merge-rankings';
import { readRankedMatches } from './read-ranked-matches';
import { readViewItems } from './read-view-items';
import type { StoreParts } from './types';
import type { ViewItem, ViewMatch, ViewMatches } from './view-types';

const matchLimit = 100;

export async function readViewMatches(parts: StoreParts, query: string): Promise<ViewMatches> {
  const ranked = await readRankedMatches(parts, { query, limit: matchLimit, excludedIDs: [] });

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

function buildViewMatch(item: ViewItem, match: MatchScores | undefined): ViewMatch {
  return {
    ...item,
    ...(match?.score === undefined ? {} : { score: match.score }),
    ...(match?.similarity === undefined ? {} : { similarity: match.similarity }),
  };
}
