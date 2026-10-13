import { countTextTokens, renderPinnedItem } from '@heynixie/models';
import { PinnedCoreFullError } from './pinned-core-full-error';
import type { MemoryContext, MemoryOrigin, RecalledItem } from './types';

export interface CorePin {
  // the item to pin
  readonly itemID: string;

  // the text the pin puts in the core, who saved it and the quote it came up in
  readonly text: string;
  readonly origin: MemoryOrigin;
  readonly evidenceQuote: string | null;
}

// The pinned core's budget, in tokens, when the context sets none.
const defaultPinnedCoreTokens = 2000;

// Fails when a pinned item would take the pinned core past its token budget, because the core
// rides in the cached start of every turn. Each item counts as the system prompt renders it, quote
// included, with the owner's name at its default. The item's own earlier version leaves the count.
export function requirePinnedCoreRoom(
  context: Pick<MemoryContext, 'pinnedCoreTokens'>,
  pinned: readonly RecalledItem[],
  pin: CorePin,
): void {
  const core = [...pinned.filter((item) => item.itemID !== pin.itemID), pin];
  const tokens = core.reduce(
    (total, item) => total + countTextTokens(renderPinnedItem(item, null).join('\n')),
    0,
  );
  const budget = context.pinnedCoreTokens ?? defaultPinnedCoreTokens;

  if (tokens > budget) {
    throw new PinnedCoreFullError(pin.itemID, tokens, budget);
  }
}
