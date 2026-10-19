import { countBatchTokens } from './count-batch-tokens';
import type { ShownItem } from './render-writer-prompt';
import type { MemoryStore, RecalledItem } from './types';
import { writerSubjects } from './writer-subjects';

export interface ShownItemsQuery {
  // the text of your messages in the batch, which picks the items when the full list is too long
  readonly text: string;
  readonly listTokens: number;
  readonly topItems: number;
  readonly thread: string;
}

export interface ShownItems {
  readonly items: readonly ShownItem[];
  readonly isComplete: boolean;
}

// Reads the items the writer sees: every active item while they fit in the list budget, else the
// top items by keyword over your messages, so the writer revises an earlier item instead of adding
// a duplicate. Every read goes through recall, which records what it delivered and hides self-notes.
export async function readShownItems(
  store: Pick<MemoryStore, 'recall'>,
  query: ShownItemsQuery,
): Promise<ShownItems> {
  const listed = await readItemList(store, query);

  if (listed !== null) {
    return { items: listed, isComplete: true };
  }

  const matched = await store.recall({
    query: query.text.slice(0, maxQueryCharacters),
    limit: query.topItems,
    thread: query.thread,
    subjects: writerSubjects,
  });

  return { items: matched.items.map((item) => toShownItem(item)), isComplete: false };
}

// every active item a page at a time, or null once their text passes the budget
async function readItemList(
  store: Pick<MemoryStore, 'recall'>,
  query: ShownItemsQuery,
): Promise<readonly ShownItem[] | null> {
  const listed: ShownItem[] = [];
  const page: { after: string | null; tokens: number } = { after: null, tokens: 0 };

  do {
    const result = await store.recall({
      limit: pageSize,
      thread: query.thread,
      subjects: writerSubjects,
      ...(page.after === null ? {} : { after: page.after }),
    });

    listed.push(...result.items.map((item) => toShownItem(item)));

    page.tokens += result.items.reduce(
      (total, item) => total + countBatchTokens(item.text) + itemOverheadTokens,
      0,
    );

    page.after = result.next;
  } while (page.after !== null && page.tokens <= query.listTokens);

  return page.tokens <= query.listTokens ? listed : null;
}

function toShownItem(item: RecalledItem): ShownItem {
  return { itemID: item.itemID, version: item.version, subject: item.subject, text: item.text };
}

const pageSize = 100;

// the list line's ID and punctuation around each item's text
const itemOverheadTokens = 12;

// a keyword query matches any of its words, so the first few thousand characters pick the items
const maxQueryCharacters = 4000;
