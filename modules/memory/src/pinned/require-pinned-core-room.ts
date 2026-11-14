import type { MemoryContext, RecalledItem } from '../types';
import type { CorePin } from '../utils/count-pinned-core-tokens';
import { countPinnedCoreTokens } from '../utils/count-pinned-core-tokens';
import { PinnedCoreFullError } from '../utils/error/pinned-core-full-error';
import { getPinnedCoreBudget } from './get-pinned-core-budget';

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
