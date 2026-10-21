import type { MemoryContext } from './types';

const defaultPinnedCoreTokens = 2000;

export function getPinnedCoreBudget(context: Pick<MemoryContext, 'pinnedCoreTokens'>): number {
  return context.pinnedCoreTokens ?? defaultPinnedCoreTokens;
}
