import { startDatabase } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { splitContentWords } from './split-content-words';

export interface IndexEntry {
  readonly itemID: string;
  readonly text: string;
}

// A match of the index: the item and its BM25 score, negated so higher is better.
interface IndexMatch {
  readonly itemID: string;
  readonly score: number;
}

interface MatchOptions {
  readonly limit: number;

  // drops a match whose BM25 score, negated so higher is better, falls below it; in an index of 1
  // or 2 items BM25 gives every word about zero weight, so a floor above zero drops every match
  readonly minScore?: number;

  // leaves these items out before the limit applies
  readonly excludedIDs?: readonly string[];

  // leaves out each query word that stems the same as a word of one of these, whatever its case
  readonly excludedWords?: readonly string[];
}

// The keyword index of active memory items. It ranks item IDs and never supplies the text a recall
// returns, which the store reads and decrypts again under the delivery lock.
export interface MemoryIndex {
  // empties the index and fills it from entries, as at start
  readonly updateAll: (entries: readonly IndexEntry[]) => Promise<void>;

  // replaces the item's entry with the current text of an active item
  readonly update: (entry: IndexEntry) => Promise<void>;
  readonly remove: (itemID: string) => Promise<void>;

  // the IDs of the items that match any word of query other than a function word or an excluded
  // word, best match first
  readonly findItemIDs: (query: string, options: MatchOptions) => Promise<readonly string[]>;

  // the same matches with their scores, best match first
  readonly findMatches: (query: string, options: MatchOptions) => Promise<readonly IndexMatch[]>;
  readonly stop: () => Promise<void>;
}

// Starts an FTS5 index with the porter tokenizer in an in-memory SQLite database. Nothing writes it
// to disk, so a forgotten item's words never outlive the process, and each start rebuilds it from
// the readable active items. A second table with the same tokenizer stems a query's words.
export async function startMemoryIndex(): Promise<MemoryIndex> {
  const db = startDatabase(':memory:');

  try {
    await sql`create virtual table memory_index using fts5 (
      item_id unindexed,
      text,
      tokenize = 'porter unicode61'
    )`.execute(db);

    await sql`create virtual table query_words using fts5 (
      word,
      tokenize = 'porter unicode61'
    )`.execute(db);

    await sql`create virtual table query_word_stems using fts5vocab (query_words, 'instance')`.execute(
      db,
    );
  } catch (error) {
    await db.destroy();

    throw error;
  }

  return {
    updateAll: (entries) =>
      db.transaction().execute(async (tx) => {
        await sql`delete from memory_index`.execute(tx);

        for (const entry of entries) {
          await writeEntry(tx, entry);
        }
      }),
    update: (entry) =>
      db.transaction().execute(async (tx) => {
        await sql`delete from memory_index where item_id = ${entry.itemID}`.execute(tx);

        await writeEntry(tx, entry);
      }),
    remove: async (itemID) => {
      await sql`delete from memory_index where item_id = ${itemID}`.execute(db);
    },
    findItemIDs: async (query, options) => {
      const matches = await findMatches(db, query, options);

      return matches.map((match) => match.itemID);
    },
    findMatches: (query, options) => findMatches(db, query, options),
    stop: () => db.destroy(),
  };
}

// stores the item's content words only, so a function word in its text never matches a query word
// that stems to it
async function writeEntry(db: Kysely<unknown>, entry: IndexEntry): Promise<void> {
  const text = splitContentWords(entry.text).join(' ');

  await sql`insert into memory_index (item_id, text) values (${entry.itemID}, ${text})`.execute(db);
}

async function findMatches(
  db: Kysely<unknown>,
  query: string,
  options: MatchOptions,
): Promise<readonly IndexMatch[]> {
  const words = await readQueryWords(db, query, options.excludedWords ?? []);

  if (words.length === 0) {
    return [];
  }

  const minScore = options.minScore ?? 0;
  const excludedIDs = options.excludedIDs ?? [];

  const excluded =
    excludedIDs.length === 0 ? sql`` : sql`and item_id not in (${sql.join(excludedIDs)})`;

  const result = await sql<{ item_id: string; rank: number }>`select item_id, rank from memory_index
    where memory_index match ${buildMatchExpression(words)} and rank <= ${-minScore} ${excluded}
    order by rank limit ${options.limit}`.execute(db);

  return result.rows.map((row) => ({ itemID: row.item_id, score: -row.rank }));
}

// The content words of a query, less each one whose stems all belong to an excluded word. A message
// that shares only "to" or "a" with an item says nothing about it, so function words stay out. The
// tokenizer stems and case-folds both sides, so "Nixie's" drops with "nixie".
async function readQueryWords(
  db: Kysely<unknown>,
  query: string,
  excludedWords: readonly string[],
): Promise<readonly string[]> {
  const words = splitContentWords(query);
  const excluded = excludedWords.flatMap((word) => splitContentWords(word));

  if (words.length === 0 || excluded.length === 0) {
    return words;
  }

  const rows = [...words, ...excluded].map((word, index) => sql`(${index}, ${word})`);

  const stems = await db.transaction().execute(async (tx) => {
    await sql`insert into query_words (rowid, word) values ${sql.join(rows)}`.execute(tx);

    const result = await sql<{ term: string; doc: number }>`select term, doc
      from query_word_stems`.execute(tx);

    await sql`delete from query_words`.execute(tx);

    return result.rows;
  });

  const excludedStems = new Set(
    stems.filter((row) => row.doc >= words.length).map((row) => row.term),
  );

  return words.filter((_, index) => {
    const wordStems = stems.filter((row) => row.doc === index);

    return wordStems.length === 0 || !wordStems.every((row) => excludedStems.has(row.term));
  });
}

// Quotes each word and joins them with OR, so no character in the query reads as FTS5 syntax.
function buildMatchExpression(words: readonly string[]): string {
  return words.map((word) => `"${word}"`).join(' OR ');
}
