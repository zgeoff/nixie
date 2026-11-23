import type { RecallCallEntry } from '../usage/types';

export function buildMockRecallCall(overrides: Partial<RecallCallEntry> = {}): RecallCallEntry {
  return {
    sequence: 5,
    thread: 'conversation',
    resultSequence: 20,
    kind: 'other',
    ...overrides,
  };
}
