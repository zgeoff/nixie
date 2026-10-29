import { expect, test } from 'bun:test';
import { buildMockMemoryNoticeEntry } from './build-mock-memory-notice-entry';

test('it builds a default entry for an item created at version 1', () => {
  expect(buildMockMemoryNoticeEntry()).toStrictEqual({
    change: 'created',
    isKept: false,
    itemID: expect.toBeString(),
    proposalID: null,
    sequence: expect.toBeWithin(1, 1001),
    version: 1,
    item: {
      change: 'created',
      changedAt: expect.toBeValidDate(),
      createdAt: expect.toBeValidDate(),
      forgottenAt: null,
      isPinned: false,
      isSensitive: false,
      itemID: expect.toBeString(),
      kind: 'fact',
      origin: 'conversation',
      shortID: expect.toBeString(),
      source: 'owner',
      state: 'active',
      status: 'readable',
      subject: 'owner',
      text: expect.toBeString(),
      until: null,
      version: 1,
    },
  });
});

test('it gives the entry and its item one item ID', () => {
  const entry = buildMockMemoryNoticeEntry({ itemID: 'item-a' });

  expect(entry.item?.itemID).toBe('item-a');
});

test('it applies item overrides on top of the item defaults', () => {
  const entry = buildMockMemoryNoticeEntry({ item: { change: 'undone', version: 2 } });

  expect(entry.item).toMatchObject({ change: 'undone', state: 'active', version: 2 });
});

test('it builds an entry with no item', () => {
  expect(buildMockMemoryNoticeEntry({ change: 'proposed', item: null }).item).toBeNull();
});
