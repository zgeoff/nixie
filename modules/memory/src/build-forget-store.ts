import { runBegunForget } from './run-begun-forget';
import { runBegunForgets } from './run-begun-forgets';
import { runForget } from './run-forget';
import { runForgetAll } from './run-forget-all';
import { runForgetRetired } from './run-forget-retired';
import type { MemoryStore, StoreParts } from './types';

export function buildForgetStore(
  parts: StoreParts,
): Pick<MemoryStore, 'forget' | 'finishForget' | 'forgetRetired' | 'forgetAll' | 'finishForgets'> {
  return {
    forget: (request) => runForget(parts, request),
    finishForget: (itemID) => runBegunForget(parts, itemID),
    forgetRetired: (request) => runForgetRetired(parts, request),
    forgetAll: (request) => runForgetAll(parts, request),
    finishForgets: (itemIDs) => runBegunForgets(parts, itemIDs),
  };
}
