import type { RecallCallEntry } from '../usage/types';

export function buildMockRecallCall(overrides: Partial<RecallCallEntry> = {}): RecallCallEntry {
  return {
    sequence: 5,
    thread: 'conversation',
    endSequence: 20,
    hasResult: true,
    kind: 'other',
    ...overrides,
  };
}
