import { countBatchTokens } from './count-batch-tokens';
import type { ShownItem } from './render-writer-prompt';
import type { MemoryStore, RecalledItem } from './types';
import { writerSubjects } from './writer-subjects';

export interface ShownItemsQuery {
  readonly text: string;
  readonly listTokens: number;
  readonly topItems: number;
  readonly thread: string;
}

export interface ShownItems {
  readonly items: readonly ShownItem[];
  readonly isComplete: boolean;
}

const maxQueryCharacters = 4000;

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

const pageSize = 100;
const itemOverheadTokens = 12;

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
