import type { Effect } from '../types';

// A reading effect is read or fetch. A call with only reading effects acts nowhere.
export function isReadingCall(effects: readonly Effect[]): boolean {
  return effects.length > 0 && effects.every((effect) => effect === 'read' || effect === 'fetch');
}
