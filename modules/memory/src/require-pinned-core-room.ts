import type { CorePin } from './count-pinned-core-tokens';
import { countPinnedCoreTokens } from './count-pinned-core-tokens';
import { getPinnedCoreBudget } from './get-pinned-core-budget';
import { PinnedCoreFullError } from './pinned-core-full-error';
import type { MemoryContext, RecalledItem } from './types';

// Fails when a pinned item would take the pinned core past its token budget, because the core
// rides in the cached start of every session. The item's earlier version leaves the count.
export function requirePinnedCoreRoom(
  context: Pick<MemoryContext, 'pinnedCoreTokens' | 'gate'>,
  pinned: readonly RecalledItem[],
  pin: CorePin,
): void {
  const core = [...pinned.filter((item) => item.itemID !== pin.itemID), pin];
  const tokens = countPinnedCoreTokens(context, core);
  const budget = getPinnedCoreBudget(context);

  if (tokens > budget) {
    throw new PinnedCoreFullError(pin.itemID, tokens, budget);
  }
}
