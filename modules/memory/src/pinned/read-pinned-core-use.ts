import type { PinnedCoreUse } from '@heynixie/sessions';
import type { StoreParts } from '../types';
import { countPinnedCoreTokens } from '../utils/count-pinned-core-tokens';
import { getPinnedCoreBudget } from './get-pinned-core-budget';
import { readPinnedItems } from './read-pinned-items';

export function readPinnedCoreUse(parts: StoreParts): Promise<PinnedCoreUse> {
  return parts.lock(async () => {
    const pinned = await readPinnedItems(parts);

    return {
      items: pinned.length,
      tokens: countPinnedCoreTokens(parts.context, pinned),
      budget: getPinnedCoreBudget(parts.context),
    };
  });
}
