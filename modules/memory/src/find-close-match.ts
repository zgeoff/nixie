import type { CloseMatch } from './gate-types';
import { readRecall } from './read-recall';
import type { StoreParts } from './types';

// Finds the active item that best matches a proposal's text: the retrieval index ranks the
// candidates, and the item that shares the most content words with the text, at or above the
// close-match score, is the match. It returns null when no item comes that close.
export async function findCloseMatch(parts: StoreParts, text: string): Promise<CloseMatch | null> {
  const itemIDs = await parts.index.findItemIDs(text, { limit: candidateLimit });

  if (itemIDs.length === 0) {
    return null;
  }
  const recalled = await readRecall(parts, { itemIDs, limit: itemIDs.length });
  const words = collectContentWords(text);
  const scored = recalled.items
    .map((item) => ({ item, score: buildOverlapScore(words, collectContentWords(item.text)) }))
    .filter((entry) => entry.score >= parts.context.gate.limits.closeMatchScore)
    .toSorted((first, second) => second.score - first.score);
  const best = scored[0]?.item;

  return best === undefined
    ? null
    : { itemID: best.itemID, version: best.version, text: best.text };
}

const candidateLimit = 5;

// the words that carry a fact, lower case and without a plural s, so "The owner likes cats" and
// "Owner likes cat" share every word that matters
function collectContentWords(text: string): ReadonlySet<string> {
  const words =
    text
      .normalize('NFC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];

  return new Set(
    words
      .filter((word) => !stopWords.has(word))
      .map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word)),
  );
}

const stopWords = new Set([
  'a',
  'an',
  'and',
  'are',
  'at',
  'for',
  'has',
  'have',
  'in',
  'is',
  'of',
  'on',
  'owner',
  'owners',
  's',
  'the',
  'their',
  'they',
  'to',
  'was',
  'with',
]);

// the Dice coefficient of two word sets: twice the shared words over the words in both
function buildOverlapScore(first: ReadonlySet<string>, second: ReadonlySet<string>): number {
  const total = first.size + second.size;

  if (total === 0) {
    return 0;
  }
  const shared = [...first].filter((word) => second.has(word)).length;

  return (2 * shared) / total;
}
