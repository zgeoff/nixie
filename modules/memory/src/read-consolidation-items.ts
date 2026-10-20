import { countBatchTokens } from './count-batch-tokens';
import type { MemoryStore, RecallRequest, RecalledItem } from './types';

export interface ConsolidationItemsQuery {
  readonly listTokens: number;
  readonly thread: string;
}

export interface ConsolidationItems {
  readonly items: readonly RecalledItem[];

  // whether the items are every active item, or the oldest ones that fit the budget
  readonly isComplete: boolean;
}

// Reads the active items the consolidator sees, a page at a time in the order they were created,
// until their text and quotes pass the list budget. Every read goes through recall, which records what it
// delivered, and no read touches the conversation.
export async function readConsolidationItems(
  store: Pick<MemoryStore, 'recall'>,
  query: ConsolidationItemsQuery,
): Promise<ConsolidationItems> {
  const listed: RecalledItem[] = [];
  const page: { after: string | null; budget: number } = { after: null, budget: query.listTokens };

  do {
    const result = await store.recall(buildPageRequest(query.thread, page.after));

    const fits = collectFittingItems(result.items, page.budget);

    listed.push(...fits.items);

    if (fits.items.length < result.items.length) {
      return { items: listed, isComplete: false };
    }

    Object.assign(page, { after: result.next, budget: page.budget - fits.tokens });
  } while (page.after !== null);

  return { items: listed, isComplete: true };
}

const pageSize = 100;

function buildPageRequest(thread: string, after: string | null): RecallRequest {
  return { limit: pageSize, thread, ...(after === null ? {} : { after }) };
}

// the list line's ID, date, flags and punctuation around each item's text and quote
const itemOverheadTokens = 24;

// the leading items of a page whose text and quote fit the tokens left, and the tokens they take
function collectFittingItems(
  items: readonly RecalledItem[],
  budget: number,
): { readonly items: readonly RecalledItem[]; readonly tokens: number } {
  const fitting: RecalledItem[] = [];
  let tokens = 0;

  for (const item of items) {
    const itemTokens =
      countBatchTokens(item.text) + countBatchTokens(item.evidenceQuote ?? '') + itemOverheadTokens;

    if (tokens + itemTokens > budget) {
      break;
    }

    tokens += itemTokens;

    fitting.push(item);
  }

  return { items: fitting, tokens };
}
