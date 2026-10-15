import { expect, test } from 'bun:test';
import { readVersionTexts } from './read-version-texts';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it reads the text of each named version in the order named', async () => {
  const ctx = await setupTest();

  const first = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const second = await ctx.memory.store.remember({
    text: 'Allergic to hazelnuts',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: first,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const texts = await readVersionTexts(ctx.memory.log, [second, first]);

  expect(texts).toStrictEqual([
    { itemID: second.itemID, version: 1, status: 'readable', text: 'Allergic to hazelnuts' },
    { itemID: first.itemID, version: 1, status: 'readable', text: 'Lives on Elm Street' },
  ]);
});

test('it reads a version of a forgotten item as shredded', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const texts = await readVersionTexts(ctx.memory.log, [item]);

  expect(texts).toStrictEqual([{ itemID: item.itemID, version: 1, status: 'shredded' }]);
});

test('it reads a version whose key fails to unwrap as unreadable', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const otherKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
    'wrapKey',
    'unwrapKey',
  ]);

  const texts = await readVersionTexts({ deploymentKey: otherKey, writer: ctx.memory.writer }, [
    item,
  ]);

  expect(texts).toStrictEqual([{ itemID: item.itemID, version: 1, status: 'unreadable' }]);
});

test('it reads a version that never existed as missing', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const texts = await readVersionTexts(ctx.memory.log, [
    { itemID: item.itemID, version: 2 },
    { itemID: 'no-such-item', version: 1 },
  ]);

  expect(texts).toStrictEqual([
    { itemID: item.itemID, version: 2, status: 'missing' },
    { itemID: 'no-such-item', version: 1, status: 'missing' },
  ]);
});
