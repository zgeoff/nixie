import { readQueryRows, startDatabase } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { splitContentWords } from './split-content-words';

export interface IndexEntry {
  readonly itemID: string;
  readonly text: string;
}

interface IndexMatch {
  readonly itemID: string;
  readonly score: number;
}

interface MatchOptions {
  readonly limit: number;

  // In an index of 1 or 2 items, BM25 gives every word about zero weight, so a floor above zero
  // drops every match.
  readonly minScore?: number;

  readonly excludedIDs?: readonly string[];

  readonly excludedWords?: readonly string[];
}

export interface MemoryIndex {
  readonly updateAll: (entries: readonly IndexEntry[]) => Promise<void>;

  readonly update: (entry: IndexEntry) => Promise<void>;
  readonly remove: (itemID: string) => Promise<void>;

  readonly readItemIDs: (query: string, options: MatchOptions) => Promise<readonly string[]>;

  readonly readMatches: (query: string, options: MatchOptions) => Promise<readonly IndexMatch[]>;
  readonly stop: () => Promise<void>;
}

// The index lives in an in-memory SQLite database and never reaches disk, so a forgotten item's
// words never outlive the process.
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
    readItemIDs: async (query, options) => {
      const matches = await readMatches(db, query, options);

      return matches.map((match) => match.itemID);
    },
    readMatches: (query, options) => readMatches(db, query, options),
    stop: () => db.destroy(),
  };
}

async function writeEntry(db: Kysely<unknown>, entry: IndexEntry): Promise<void> {
  const text = splitContentWords(entry.text).join(' ');

  await sql`insert into memory_index (item_id, text) values (${entry.itemID}, ${text})`.execute(db);
}

async function readMatches(
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

  const rows = await readQueryRows(
    sql`select item_id, rank from memory_index
      where memory_index match ${buildMatchExpression(words)} and rank <= ${-minScore} ${excluded}
      order by rank limit ${options.limit}`,
    db,
    z.object({ item_id: z.string(), rank: z.number() }),
  );

  return rows.map((row) => ({ itemID: row.item_id, score: -row.rank }));
}

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

    const termRows = await readQueryRows(
      sql`select term, doc from query_word_stems`,
      tx,
      z.object({ term: z.string(), doc: z.number() }),
    );

    await sql`delete from query_words`.execute(tx);

    return termRows;
  });

  const excludedStems = new Set(
    stems.filter((row) => row.doc >= words.length).map((row) => row.term),
  );

  return words.filter((_, index) => {
    const wordStems = stems.filter((row) => row.doc === index);

    return wordStems.length === 0 || !wordStems.every((row) => excludedStems.has(row.term));
  });
}

// Each word is quoted so that no character in the query reads as FTS5 syntax.
function buildMatchExpression(words: readonly string[]): string {
  return words.map((word) => `"${word}"`).join(' OR ');
}
