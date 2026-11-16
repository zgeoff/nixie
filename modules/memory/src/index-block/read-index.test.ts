import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { buildMemorySeeder } from '../test-utils/build-memory-seeder';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { startTestMemory } from '../test-utils/start-test-memory';
import type { MemoryIndexConfig } from './default-index-settings';

async function setupTest(index?: Partial<MemoryIndexConfig>) {
  const clock = buildTestClock(Date.parse('2026-11-02T09:00:00Z'));

  const memory = await startTestMemory({
    gate: { clock },
    ...(index === undefined ? {} : { index }),
  });

  return { ...memory, seed: buildMemorySeeder({ store: memory.store, log: memory.log, clock }) };
}

test('it lists only the active items that are not pinned, one row per topic', async () => {
  const ctx = await setupTest();

  await ctx.seed.item({
    text: 'Keeps a herb garden',
    labels: { gist: 'herb garden', topic: 'garden', triggers: [] },
  });

  await ctx.seed.item({
    text: 'Grows tomatoes',
    labels: { gist: 'tomatoes', topic: 'garden', triggers: [] },
  });

  await ctx.seed.item({
    text: 'Lives on Elm Street',
    labels: { gist: 'Elm Street', topic: 'home', triggers: [] },
    isPinned: true,
  });

  const retired = await ctx.seed.item({
    text: 'Owns a canoe',
    labels: { gist: 'canoe', topic: 'boats', triggers: [] },
  });

  await ctx.store.retire({ target: retired, provenance: buildMockProvenance() });

  const index = await ctx.store.readIndex();

  expect(index.items).toBe(2);
  expect(index.text).toMatch(/garden \(2\) +\[\w{10}\] tomatoes · \[\w{10}\] herb garden/u);
  expect(index.text).not.toInclude('Elm Street');
  expect(index.text).not.toInclude('canoe');
});

test('it reports the tokens of its text against the budget', async () => {
  const ctx = await setupTest();

  await ctx.seed.item({
    text: 'Keeps a herb garden',
    labels: { gist: 'herb garden', topic: 'garden', triggers: [] },
  });

  const index = await ctx.store.readIndex();

  expect(index).toStrictEqual({
    text: expect.stringContaining('herb garden'),
    items: 1,
    tokens: Math.ceil(index.text.length / 4),
    budget: 3000,
  });
});

test('it writes no record', async () => {
  const ctx = await setupTest();

  await ctx.seed.item({
    text: 'Keeps a herb garden',
    labels: { gist: 'herb garden', topic: 'garden', triggers: [] },
  });

  const before = await readRecords(ctx.log, { afterSequence: 0 });

  await ctx.store.readIndex();

  const after = await readRecords(ctx.log, { afterSequence: 0 });

  expect(after.length).toBe(before.length);
});

test('it returns no text when no item is active and unpinned', async () => {
  const ctx = await setupTest();

  await ctx.seed.item({
    text: 'Lives on Elm Street',
    labels: { gist: 'Elm Street', topic: 'home', triggers: [] },
    isPinned: true,
  });

  const index = await ctx.store.readIndex();

  expect(index).toStrictEqual({ text: '', items: 0, tokens: 0, budget: 3000 });
});

test('it returns no text and no tokens at a budget of 0, and counts the items', async () => {
  const ctx = await setupTest({ tokens: 0 });

  await ctx.seed.item({
    text: 'Keeps a herb garden',
    labels: { gist: 'herb garden', topic: 'garden', triggers: [] },
  });

  const index = await ctx.store.readIndex();

  expect(index).toStrictEqual({ text: '', items: 1, tokens: 0, budget: 0 });
});

test('it folds a topic past the open limit the config names', async () => {
  const ctx = await setupTest({ openTopicItems: 2 });

  for (const gist of ['one', 'two', 'three']) {
    await ctx.seed.item({
      text: `Fact ${gist}`,
      labels: { gist, topic: 'garden/beds', triggers: [] },
    });
  }

  const index = await ctx.store.readIndex();

  expect(index.text.replaceAll(/\s+/gu, ' ')).toInclude('garden (3) folded · newest: ');
  expect(index.text).toInclude('sub-topics: beds 3');
});
