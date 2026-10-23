import { expect, test } from 'bun:test';
import { buildMockRetiredForgetItem } from './build-mock-retired-forget-item';

test('it builds a readable retired item at version 2 that destroys nothing beyond its text', () => {
  expect(buildMockRetiredForgetItem()).toStrictEqual({
    changedAt: expect.toBeValidDate(),
    createdAt: expect.toBeValidDate(),
    forgottenAt: null,
    isPinned: false,
    itemID: expect.toBeString(),
    kind: 'fact',
    lost: { evidenceMessages: 0, proposals: 0 },
    origin: 'owner',
    shortID: expect.toBeString(),
    source: 'owner',
    state: 'retired',
    status: 'readable',
    subject: 'owner',
    text: expect.toBeString(),
    until: null,
    version: 2,
  });
});

test('it applies overrides on top of the defaults', () => {
  const item = buildMockRetiredForgetItem({ itemID: 'item-a', version: 3 });

  expect(item).toMatchObject({ itemID: 'item-a', state: 'retired', version: 3 });
});
