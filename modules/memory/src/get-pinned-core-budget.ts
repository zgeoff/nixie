import type { MemoryContext } from './types';

// The pinned core's budget, in tokens, when the context sets none.
const defaultPinnedCoreTokens = 2000;

// The pinned core's budget in tokens, from the context or its default.
export function getPinnedCoreBudget(context: Pick<MemoryContext, 'pinnedCoreTokens'>): number {
  return context.pinnedCoreTokens ?? defaultPinnedCoreTokens;
}
