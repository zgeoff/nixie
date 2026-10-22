import { expect, test } from 'bun:test';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { startTestMemory } from './test-utils/start-test-memory';

test('it counts no item and no token in an empty core, against the budget', async () => {
  const memory = await startTestMemory();

  await memory.store.remember({ text: 'Keeps a herb garden', provenance: buildMockProvenance() });

  const use = await memory.store.readPinnedCoreUse();

  expect(use).toStrictEqual({ items: 0, tokens: 0, budget: 2000 });
});

test('it counts each active pinned item and the tokens the memory view shows for the core', async () => {
  const memory = await startTestMemory();

  await memory.store.remember({
    text: 'Keeps a herb garden',
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  await memory.store.remember({
    text: 'Bikes to the market on Saturdays',
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  const retired = await memory.store.remember({
    text: 'Lives on Elm Street',
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  await memory.store.retire({ target: retired, provenance: buildMockProvenance() });

  const use = await memory.store.readPinnedCoreUse();
  const view = await memory.store.view.readPinnedCore();

  expect(use).toStrictEqual({ items: 2, tokens: view.tokens, budget: 2000 });
  expect(use.tokens).toBeGreaterThan(0);
});
