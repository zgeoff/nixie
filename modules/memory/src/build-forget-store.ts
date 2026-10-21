import { runBegunForget } from './run-begun-forget';
import { runForget } from './run-forget';
import type { MemoryStore, StoreParts } from './types';

export function buildForgetStore(parts: StoreParts): Pick<MemoryStore, 'forget' | 'finishForget'> {
  return {
    forget: (request) => runForget(parts, request),
    finishForget: (itemID) => runBegunForget(parts, itemID),
  };
}
