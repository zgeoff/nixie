import type { RecalledEntry } from '../usage/types';

export function buildMockRecalledEntry(overrides: Partial<RecalledEntry> = {}): RecalledEntry {
  return {
    sequence: 10,
    thread: 'conversation',
    recordedAtMs: 1000,
    itemIDs: ['item-a'],
    hasSearchMode: true,
    isTurnNote: false,
    ...overrides,
  };
}
