import { startDatabase } from '@heynixie/db';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export interface IndexEntry {
  readonly itemID: string;
  readonly text: string;
}

interface MatchOptions {
  readonly limit: number;

  // drops a match whose BM25 score, negated so higher is better, falls below it; in an index of 1
  // or 2 items BM25 gives every word about zero weight, so a floor above zero drops every match
  readonly minScore?: number;

  // leaves these items out before the limit applies
  readonly excludedIDs?: readonly string[];
}

// The keyword index of active memory items. It ranks item IDs and never supplies the text a recall
// returns, which the store reads and decrypts again under the delivery lock.
export interface MemoryIndex {
  // empties the index and fills it from entries, as at start
  readonly updateAll: (entries: readonly IndexEntry[]) => Promise<void>;

  // replaces the item's entry with the current text of an active item
  readonly update: (entry: IndexEntry) => Promise<void>;
  readonly remove: (itemID: string) => Promise<void>;

  // the IDs of the items that match any word of query, best match first
  readonly findItemIDs: (query: string, options: MatchOptions) => Promise<readonly string[]>;
  readonly stop: () => Promise<void>;
}

// Starts an FTS5 index with the porter tokenizer in an in-memory SQLite database. Nothing writes it
// to disk, so a forgotten item's words never outlive the process, and each start rebuilds it from
// the readable active items.
export async function startMemoryIndex(): Promise<MemoryIndex> {
  const db = startDatabase(':memory:');

  try {
    await sql`create virtual table memory_index using fts5 (
      item_id unindexed,
      text,
      tokenize = 'porter unicode61'
    )`.execute(db);
  } catch (error) {
    await db.destroy();
    throw error;
  }
  return {
    updateAll: (entries) =>
      db.transaction().execute(async (tx) => {
        await sql`delete from memory_index`.execute(tx);
        for (const entry of entries) {
          // oxlint-disable-next-line no-await-in-loop -- one connection runs one statement at a time
          await sql`insert into memory_index (item_id, text) values (${entry.itemID}, ${entry.text})`.execute(
            tx,
          );
        }
      }),
    update: (entry) =>
      db.transaction().execute(async (tx) => {
        await sql`delete from memory_index where item_id = ${entry.itemID}`.execute(tx);
        await sql`insert into memory_index (item_id, text) values (${entry.itemID}, ${entry.text})`.execute(
          tx,
        );
      }),
    remove: async (itemID) => {
      await sql`delete from memory_index where item_id = ${itemID}`.execute(db);
    },
    findItemIDs: (query, options) => findMatches(db, query, options),
    stop: () => db.destroy(),
  };
}

async function findMatches(
  db: Kysely<unknown>,
  query: string,
  options: MatchOptions,
): Promise<readonly string[]> {
  const match = buildMatchExpression(query);

  if (match === null) {
    return [];
  }
  const minScore = options.minScore ?? 0;
  const excludedIDs = options.excludedIDs ?? [];
  const excluded =
    excludedIDs.length === 0 ? sql`` : sql`and item_id not in (${sql.join(excludedIDs)})`;
  const result = await sql<{ item_id: string }>`select item_id from memory_index
    where memory_index match ${match} and rank <= ${-minScore} ${excluded}
    order by rank limit ${options.limit}`.execute(db);

  return result.rows.map((row) => row.item_id);
}

// Quotes each word of a free-text query and joins them with OR, so no character in the query reads
// as FTS5 syntax, or null for a query with no word in it.
function buildMatchExpression(query: string): string | null {
  const words = query.match(/[\p{L}\p{N}]+/gu) ?? [];

  return words.length === 0 ? null : words.map((word) => `"${word}"`).join(' OR ');
}
