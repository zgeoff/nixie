import type { Kysely } from 'kysely';
import type { CloseMatch } from './gate-types';
import { readDeliverableItems } from './read-deliverable-items';
import { readRecall } from './read-recall';
import { subjectColumn } from './subject-column';
import type { MemorySubject, MemoryTables, RecalledItem, StoreParts } from './types';

export interface CloseMatchQuery {
  readonly text: string;

  // the subject of the proposal's item, because an item matches only one of its own subject; owner
  // when unset
  readonly subject?: MemorySubject;

  // a write transaction that holds the delivery lock, which reads the candidates with no recall
  // record; through a recall, which records what it delivered, when unset
  readonly db?: Kysely<MemoryTables>;
}

// Finds the active item that best matches a proposal's text: the retrieval index ranks the
// candidates, and the item that shares the most content words with the text, at or above the
// close-match score, is the match. It returns null when no item comes that close.
export async function findCloseMatch(
  parts: StoreParts,
  query: CloseMatchQuery,
): Promise<CloseMatch | null> {
  const subject = query.subject ?? 'owner';

  // the other subjects' items leave the ranking before its limit applies, so a run of them never
  // pushes a match of the proposal's own subject past the cut
  const itemIDs = await parts.index.findItemIDs(query.text, {
    limit: candidateLimit,
    excludedIDs: await readOtherSubjectIDs(parts, subject, query.db),
  });

  if (itemIDs.length === 0) {
    return null;
  }

  const candidates = await readCandidates(parts, itemIDs, query.db);

  const items = candidates.filter((item) => item.subject === subject);
  const words = collectContentWords(query.text);

  const scored = items
    .map((item) => ({ item, score: buildOverlapScore(words, collectContentWords(item.text)) }))
    .filter((entry) => entry.score >= parts.context.gate.limits.closeMatchScore)
    .toSorted((first, second) => second.score - first.score);

  const best = scored[0]?.item;

  return best === undefined
    ? null
    : { itemID: best.itemID, version: best.version, text: best.text };
}

const candidateLimit = 5;

async function readOtherSubjectIDs(
  parts: StoreParts,
  subject: MemorySubject,
  db: Kysely<MemoryTables> | undefined,
): Promise<readonly string[]> {
  const rows = await (db ?? parts.context.log.writer.db.$extendTables<MemoryTables>())
    .selectFrom('memory_items')
    .select('item_id')
    .where(subjectColumn, '!=', subject)
    .where('state', '=', 'active')
    .execute();

  return rows.map((row) => row.item_id);
}

async function readCandidates(
  parts: StoreParts,
  itemIDs: readonly string[],
  db: Kysely<MemoryTables> | undefined,
): Promise<readonly RecalledItem[]> {
  if (db !== undefined) {
    return readDeliverableItems(parts, { itemIDs, states: ['active'], includeHistory: false, db });
  }

  const recalled = await readRecall(parts, { itemIDs, limit: itemIDs.length });

  return recalled.items;
}

// the words that carry a fact, lower case and without a plural s, so "The owner likes cats" and
// "Owner likes cat" share every word that matters
function collectContentWords(text: string): readonly string[] {
  const words =
    text
      .normalize('NFC')
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) ?? [];

  return [
    ...new Set(
      words
        .filter((word) => !stopWords.has(word))
        .map((word) => (word.length > 3 && word.endsWith('s') ? word.slice(0, -1) : word)),
    ),
  ];
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
function buildOverlapScore(first: readonly string[], second: readonly string[]): number {
  const total = first.length + second.length;

  if (total === 0) {
    return 0;
  }

  const shared = first.filter((word) => second.includes(word)).length;

  return (2 * shared) / total;
}
