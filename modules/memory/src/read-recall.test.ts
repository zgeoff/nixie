import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { startFaultPointHold } from './test-utils/start-fault-point-hold';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it returns the items that match a query word for word, with their provenance', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'The library closes at six on Sundays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await ctx.memory.store.recall({ query: 'blue flowerpot' });

  expect(result).toStrictEqual({
    items: [
      {
        itemID: item.itemID,
        version: 1,
        change: 'created',
        state: 'active',
        isPinned: false,
        origin: 'owner',
        source: 'owner',
        recordedAt: expect.toBeNumber(),
        text: 'The spare key sits under the blue flowerpot',
      },
    ],
    next: null,
  });
});

test('it leaves pinned items out of a query when asked', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'Goes by Sam, and the spare key is with Sam',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const unpinned = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const result = await ctx.memory.store.recall({
    query: 'spare key',
    limit: 1,
    excludePinned: true,
  });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([unpinned.itemID]);
});

test('it finds an unpinned match when more pinned matches rank first than recall ranks at most', async () => {
  const ctx = await setupTest();

  // 101 short pinned items, each ranking above the longer unpinned one
  await Promise.all(
    Array.from({ length: 101 }, (_, index) =>
      ctx.memory.store.remember({
        text: `Spare key ${index}`,
        isPinned: true,
        provenance: {
          origin: 'owner',
          source: 'owner',
          taskID: null,
          proposalID: null,
          checks: null,
        },
      }),
    ),
  );

  const unpinned = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot by the door',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const result = await ctx.memory.store.recall({
    query: 'spare key',
    limit: 1,
    excludePinned: true,
  });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([unpinned.itemID]);
});

test('it leaves out a match below the score floor', async () => {
  const ctx = await setupTest();
  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;
  const flowerpot = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance,
  });

  await ctx.memory.store.remember({ text: 'The dentist is on Tuesday at nine', provenance });
  await ctx.memory.store.remember({ text: 'The library closes at six on Sundays', provenance });
  await ctx.memory.store.remember({ text: 'Allergic to hazelnuts and the cat', provenance });

  const result = await ctx.memory.store.recall({ query: 'the flowerpot', minScore: 0.25 });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([flowerpot.itemID]);
});

test('it matches a query word through its stem', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Waters the ferns every Tuesday',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await ctx.memory.store.recall({ query: 'watering' });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([item.itemID]);
});

test('it returns items by ID in the order asked', async () => {
  const ctx = await setupTest();
  const first = await ctx.memory.store.remember({
    text: 'Prefers window seats on trains',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const second = await ctx.memory.store.remember({
    text: 'Allergic to hazelnuts',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await ctx.memory.store.recall({ itemIDs: [second.itemID, first.itemID] });

  expect(result.items.map((recalled) => recalled.text)).toStrictEqual([
    'Allergic to hazelnuts',
    'Prefers window seats on trains',
  ]);
});

test('it lists every active item a page at a time', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'Prefers window seats on trains',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  await ctx.memory.store.remember({
    text: 'Allergic to hazelnuts',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  await ctx.memory.store.remember({
    text: 'The library closes at six on Sundays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const firstPage = await ctx.memory.store.recall({ limit: 2 });
  const secondPage = await ctx.memory.store.recall({ limit: 2, after: firstPage.next ?? '' });

  expect(firstPage.items.map((recalled) => recalled.text)).toStrictEqual([
    'Prefers window seats on trains',
    'Allergic to hazelnuts',
  ]);
  expect(secondPage).toMatchObject({
    items: [{ text: 'The library closes at six on Sundays' }],
    next: null,
  });
});

test('it rejects a cursor that no page returned', async () => {
  const ctx = await setupTest();

  const recall = ctx.memory.store.recall({ after: 'abc' });

  await recall.catch(() => {});

  expect(recall).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
});

test('it leaves a retired item out unless asked for retired items', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const active = await ctx.memory.store.recall({ itemIDs: [item.itemID] });
  const withRetired = await ctx.memory.store.recall({
    itemIDs: [item.itemID],
    includeRetired: true,
  });

  expect(active.items).toStrictEqual([]);
  expect(withRetired.items).toMatchObject([{ state: 'retired', text: 'Lives on Elm Street' }]);
});

test('it returns every version of an item with its history', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: null,
    },
  });

  const result = await ctx.memory.store.recall({ itemIDs: [item.itemID], includeHistory: true });

  expect(result.items).toMatchObject([
    {
      version: 2,
      text: 'Lives on Oak Avenue',
      history: [
        { version: 1, change: 'created', origin: 'owner', text: 'Lives on Elm Street' },
        { version: 2, change: 'edited', origin: 'conversation', text: 'Lives on Oak Avenue' },
      ],
    },
  ]);
});

test('it records each item and version it delivered, and no text', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.recall({ query: 'flowerpot', thread: 'conversation' });

  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(
    records.map((entry) => entry.record).filter((record) => record.kind === 'memory.recalled'),
  ).toMatchObject([
    {
      thread: 'conversation',
      payload: { items: [{ itemID: item.itemID, version: 1 }] },
      erasable: { status: 'none' },
    },
  ]);
});

test('it records every version that a history recall delivered', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Lives on Oak Avenue',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  await ctx.memory.store.recall({ itemIDs: [item.itemID], includeHistory: true });

  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(records.at(-1)?.record).toMatchObject({
    kind: 'memory.recalled',
    payload: {
      items: [
        { itemID: item.itemID, version: 1 },
        { itemID: item.itemID, version: 2 },
      ],
    },
  });
});

test('it holds a forget until a recall that checked the item has recorded its delivery', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const hold = startFaultPointHold('memory.recall.checked');
  const recall = ctx.memory.store.recall({ itemIDs: [item.itemID] });

  await hold.reached;

  const forget = ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  hold.release();

  await Promise.all([recall, forget]);

  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(records.map((entry) => entry.record)).toMatchObject([
    { kind: 'memory.version_added' },
    { kind: 'memory.recalled', payload: { items: [{ itemID: item.itemID, version: 1 }] } },
    { kind: 'memory.forget_started' },
    { kind: 'memory.forgotten' },
  ]);
});

test('it never delivers an item that a forget removed while the recall ranked it', async () => {
  const ctx = await setupTest();
  const item = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  const hold = startFaultPointHold('memory.recall.ranked');
  const recall = ctx.memory.store.recall({ query: 'flowerpot', thread: 'conversation' });
  const ranked = await hold.reached;

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });
  hold.release();

  const result = await recall;

  expect(ranked).toStrictEqual({ kind: 'memory', id: null });
  expect(result).toStrictEqual({ items: [], next: null });
});
