import { faker } from '@faker-js/faker';
import type { RetiredForgetItem } from '../types';

export function buildMockRetiredForgetItem(
  overrides: Partial<RetiredForgetItem> = {},
): RetiredForgetItem {
  const recordedAt = faker.date.recent();

  return {
    changedAt: recordedAt,
    createdAt: recordedAt,
    forgottenAt: null,
    isPinned: false,
    itemID: faker.string.uuid(),
    kind: 'fact',
    lost: { evidenceMessages: 0, proposals: 0 },
    origin: 'owner',
    shortID: faker.string.alphanumeric(6),
    source: 'owner',
    state: 'retired',
    status: 'readable',
    subject: 'owner',
    text: faker.lorem.sentence(),
    version: 2,
    ...overrides,
  };
}
