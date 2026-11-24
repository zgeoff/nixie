import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { checkForgettableKinds } from './check-forgettable-kinds';
import { erasableDescriptors } from './erasable-descriptors';

function setupTest() {
  const listPath = join(
    import.meta.dir,
    '../../../../libs/contract/src/contract/forgettable-kinds.ts',
  );

  return { readCommitted: () => Bun.file(listPath).text() };
}

test('it accepts the committed list of the contract', async () => {
  const ctx = setupTest();

  const committed = await ctx.readCommitted();

  expect(checkForgettableKinds(committed, erasableDescriptors)).toBeNull();
});

test('it fails a committed list that a hand edit changed', async () => {
  const ctx = setupTest();

  const committed = await ctx.readCommitted();

  const edited = committed.replace(
    "  'action.outcome',\n",
    "  'action.outcome',\n  'hand.added',\n",
  );

  expect(checkForgettableKinds(edited, erasableDescriptors)).toMatch(/forgettable-kinds/u);
});

test('it fails a committed list when a descriptor gains a forgettable kind', async () => {
  const ctx = setupTest();

  const committed = await ctx.readCommitted();

  const descriptors = [
    ...erasableDescriptors,
    {
      kind: 'image',
      recordKinds: { erasable: [], forgettable: ['image.drawn'], unforgettable: [] },
      legacyEnds: [],
    },
  ] as const;

  expect(checkForgettableKinds(committed, descriptors)).toMatch(/forgettable-kinds/u);
});
