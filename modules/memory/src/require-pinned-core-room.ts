import { countTextTokens } from '@heynixie/models';
import { PinnedCoreFullError } from './pinned-core-full-error';
import type { MemoryContext, RecalledItem } from './types';

export interface CorePin {
  // the item to pin, or null for an item the pin creates
  readonly itemID: string | null;

  // the text the pin puts in the core
  readonly text: string;
}

// The pinned core's budget, in tokens, when the context sets none.
const defaultPinnedCoreTokens = 2000;

// Fails when a pinned item's text would take the pinned core past its token budget, because the
// core rides in the cached start of every turn. The pinned items are the core as the caller read it
// under the delivery lock, and the item's own earlier text leaves the count.
export function requirePinnedCoreRoom(
  context: Pick<MemoryContext, 'pinnedCoreTokens'>,
  pinned: readonly RecalledItem[],
  pin: CorePin,
): void {
  const texts = pinned.filter((item) => item.itemID !== pin.itemID).map((item) => item.text);
  const tokens = [...texts, pin.text].reduce((total, text) => total + countTextTokens(text), 0);
  const budget = context.pinnedCoreTokens ?? defaultPinnedCoreTokens;

  if (tokens > budget) {
    throw new PinnedCoreFullError(pin.itemID, tokens, budget);
  }
}
