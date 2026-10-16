import { countPinnedCoreTokens } from './count-pinned-core-tokens';
import { getPinnedCoreBudget } from './get-pinned-core-budget';
import { readPinnedItems } from './read-pinned-items';
import { readViewItems } from './read-view-items';
import type { StoreParts } from './types';
import type { PinnedCoreView } from './view-types';

// Reads the pinned core as the memory view shows it: its items in the order you pinned them, and
// its size counted as a pin counts it, against its budget.
export async function readPinnedCoreView(parts: StoreParts): Promise<PinnedCoreView> {
  const pinned = await readPinnedItems(parts);

  const items = await readViewItems(
    parts.context.log,
    pinned.map((item) => item.itemID),
  );

  return {
    items,
    tokens: countPinnedCoreTokens(parts.context, pinned),
    budget: getPinnedCoreBudget(parts.context),
  };
}
