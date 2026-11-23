import { expect, test } from 'bun:test';
import { buildMockRecalledEntry } from './build-mock-recalled-entry';

test('it builds a push record of the conversation and lets a field be replaced', () => {
  expect(buildMockRecalledEntry({ itemIDs: ['item-b'] })).toStrictEqual({
    sequence: 10,
    thread: 'conversation',
    recordedAtMs: 1000,
    itemIDs: ['item-b'],
    triggers: new Map(),
    hasSearchMode: true,
    isTurnNote: false,
  });
});
