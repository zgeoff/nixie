import { faker } from '@faker-js/faker';
import type { MemoryNoticeEntry } from '../types';

type ItemOverrides = Partial<NonNullable<MemoryNoticeEntry['item']>>;

interface EntryOverrides extends Partial<Omit<MemoryNoticeEntry, 'item'>> {
  readonly item?: ItemOverrides | null;
}

export function buildMockMemoryNoticeEntry(overrides: EntryOverrides = {}): MemoryNoticeEntry {
  const itemID = overrides.itemID ?? faker.string.uuid();
  const recordedAt = faker.date.recent();

  return {
    change: 'created',
    isKept: false,
    itemID,
    proposalID: null,
    sequence: faker.number.int({ max: 1000, min: 1 }),
    version: 1,
    ...overrides,
    item:
      overrides.item === null
        ? null
        : {
            change: 'created',
            changedAt: recordedAt,
            createdAt: recordedAt,
            forgottenAt: null,
            isPinned: false,
            itemID,
            kind: 'fact',
            origin: 'conversation',
            shortID: faker.string.alphanumeric(6),
            source: 'owner',
            state: 'active',
            status: 'readable',
            subject: 'owner',
            text: faker.lorem.sentence(),
            version: 1,
            ...overrides.item,
          },
  };
}
