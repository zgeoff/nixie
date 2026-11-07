import { expect, mock, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { buildTestClock, makeGatedCall } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { buildStubEncoder } from './test-utils/build-stub-encoder';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startFaultPointHold } from './test-utils/start-fault-point-hold';
import { startNextTestMemory } from './test-utils/start-next-test-memory';
import { startTestMemory } from './test-utils/start-test-memory';
import type { MemoryTables } from './types';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test('it returns up to the limit of facts and up to the self-note limit of self-notes from one ranking, in one recall record', async () => {
  const ctx = await setupTest();

  const facts = [
    'The garden hose leaks at the tap',
    'The garden gate sticks after rain',
    'The garden fence needs paint',
    'The library closes at six on Sundays',
    'The dentist is on the high street',
    'The bins go out on Tuesday',
  ];

  const notes = ['I enjoy hearing about the garden', 'My garden tips landed well last spring'];

  await Promise.all([
    ...facts.map((text) => ctx.memory.store.remember({ text, provenance: buildMockProvenance() })),
    ...notes.map((text) =>
      ctx.memory.store.remember({ text, subject: 'self', provenance: buildMockProvenance() }),
    ),
  ]);

  const result = await ctx.memory.store.recall({ query: 'garden', limit: 2, selfNoteLimit: 1 });

  const records = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.recalled'],
  });

  expect(result.items.map((item) => item.subject).toSorted()).toStrictEqual([
    'owner',
    'owner',
    'self',
  ]);

  expect(result.items.map((item) => item.text)).toSatisfyAll((text: string) =>
    text.includes('garden'),
  );

  expect(records.map((entry) => entry.record.payload['items'])).toMatchObject([
    [
      { itemID: expect.toBeString() },
      { itemID: expect.toBeString() },
      { itemID: expect.toBeString() },
    ],
  ]);
});

test('it returns only the items of the subjects the recall names', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ctx.memory.store.remember({
      text: 'The garden hose leaks at the tap',
      provenance: buildMockProvenance(),
    }),
    ctx.memory.store.remember({
      text: 'The garden gnome is called Sir Pebble between the owner and the assistant',
      subject: 'shared',
      provenance: buildMockProvenance(),
    }),
    ctx.memory.store.remember({
      text: 'I enjoy hearing about the garden',
      subject: 'self',
      provenance: buildMockProvenance(),
    }),
  ]);

  const [queried, listed] = await Promise.all([
    ctx.memory.store.recall({ query: 'garden', subjects: ['shared', 'self'] }),
    ctx.memory.store.recall({ subjects: ['owner'] }),
  ]);

  expect(queried.items.map((item) => item.subject).toSorted()).toStrictEqual(['self', 'shared']);
  expect(listed.items.map((item) => item.text)).toStrictEqual(['The garden hose leaks at the tap']);
});

test('it fills a limited recall with the subjects it names when better matches of other subjects fill every place', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ctx.memory.store.remember({
      text: 'The garden hose leaks at the garden tap',
      provenance: buildMockProvenance(),
    }),
    ctx.memory.store.remember({
      text: 'The garden gate sticks in the garden after rain',
      provenance: buildMockProvenance(),
    }),
    ctx.memory.store.remember({
      text: 'The gnome is called Sir Pebble in the garden between the owner and the assistant',
      subject: 'shared',
      provenance: buildMockProvenance(),
    }),
  ]);

  const result = await ctx.memory.store.recall({
    query: 'garden',
    limit: 1,
    subjects: ['shared'],
  });

  expect(result.items.map((item) => item.subject)).toStrictEqual(['shared']);
});

test('it reads a self-note that the release before wrote with no subject as a self-note', async () => {
  const ctx = await setupTest();

  const note = await ctx.memory.store.remember({
    text: 'I enjoy hearing about the garden',
    subject: 'self',
    provenance: buildMockProvenance(),
  });

  await ctx.memory.log.writer.db
    .$extendTables<MemoryTables>()
    .updateTable('memory_items')
    .set({ subject: null })
    .where('item_id', '=', note.itemID)
    .execute();

  const result = await ctx.memory.store.recall({ query: 'garden', subjects: ['self'] });

  expect(result.items).toMatchObject([{ itemID: note.itemID, subject: 'self' }]);
});

test('it fills a limited recall of named items with the subjects it names when an item of another subject comes first', async () => {
  const ctx = await setupTest();

  const owner = await ctx.memory.store.remember({
    text: 'The garden hose leaks at the tap',
    provenance: buildMockProvenance(),
  });

  const shared = await ctx.memory.store.remember({
    text: 'The gnome is called Sir Pebble between the owner and the assistant',
    subject: 'shared',
    provenance: buildMockProvenance(),
  });

  const result = await ctx.memory.store.recall({
    itemIDs: [owner.itemID, shared.itemID],
    subjects: ['shared'],
    limit: 1,
  });

  expect(result.items.map((item) => item.itemID)).toStrictEqual([shared.itemID]);
});

test('it returns a matching self-note when more facts match than the largest recall holds', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ...Array.from({ length: 101 }, (_, index) =>
      ctx.memory.store.remember({
        text: `The garden bed ${index} needs water`,
        provenance: buildMockProvenance(),
      }),
    ),
    ctx.memory.store.remember({
      text: 'I enjoy hearing about the garden',
      subject: 'self',
      provenance: buildMockProvenance(),
    }),
  ]);

  const result = await ctx.memory.store.recall({ query: 'garden', limit: 100, selfNoteLimit: 1 });

  expect(result.items.filter((item) => item.subject === 'self')).toMatchObject([
    { text: 'I enjoy hearing about the garden' },
  ]);
});

test('it returns up to the limit across every subject when the recall sets no self-note limit', async () => {
  const ctx = await setupTest();

  await Promise.all([
    ...[
      'The garden hose leaks at the tap',
      'The garden gate sticks after rain',
      'The library closes at six on Sundays',
    ].map((text) => ctx.memory.store.remember({ text, provenance: buildMockProvenance() })),
    ...['I enjoy hearing about the garden', 'I like suggesting garden jobs'].map((text) =>
      ctx.memory.store.remember({ text, subject: 'self', provenance: buildMockProvenance() }),
    ),
  ]);

  const result = await ctx.memory.store.recall({ query: 'garden', limit: 3 });

  expect(result.items).toHaveLength(3);
});

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
        shortID: expect.toBeString(),
        version: 1,
        change: 'created',
        state: 'active',
        isPinned: false,
        subject: 'owner',
        origin: 'owner',
        source: 'owner',
        recordedAt: expect.toBeNumber(),
        text: 'The spare key sits under the blue flowerpot',
        evidenceQuote: null,
        image: null,
        model: null,
        approval: null,
      },
    ],
    next: null,
    searchMode: 'keyword',
  });
});

test('it returns the image a version came from with an item made from a photo', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'Paddles a red kayak',
    provenance: {
      origin: 'owner',
      source: 'untrusted',
      taskID: null,
      proposalID: null,
      checks: { tokens: 'pass', image: { messageSequence: 7, image: 2 } },
    },
  });

  const result = await ctx.memory.store.recall({ query: 'red kayak' });

  expect(result.items).toMatchObject([
    { text: 'Paddles a red kayak', image: { messageSequence: 7, image: 2 } },
  ]);
});

test('it never returns a session summary whose text matches the query', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await writeRecords(ctx.memory.log, [
    {
      kind: 'model.session_summarized',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { throughSequence: 0, trigger: 'threshold', summaryTokens: 9 },
      erasable: { text: 'Open threads: the blue flowerpot by the door.' },
    },
  ]);

  const result = await ctx.memory.store.recall({ query: 'blue flowerpot' });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([item.itemID]);
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

test('it leaves sensitive items out of a query when asked, and fills the limit from the rest', async () => {
  const ctx = await setupTest();

  const sensitive = await ctx.memory.store.remember({
    text: 'Spare key box: spare key code 4417',
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.markSensitive({
    itemID: sensitive.itemID,
    isSensitive: true,
    provenance: buildMockProvenance(),
  });

  const plain = await ctx.memory.store.remember({
    text: 'A neighbour keeps the spare key for the garden shed under the blue flowerpot by the gate',
    provenance: buildMockProvenance(),
  });

  const result = await ctx.memory.store.recall({
    query: 'spare key',
    limit: 1,
    excludeSensitive: true,
  });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([plain.itemID]);
});

test('it recalls a sensitive item for a query that does not exclude sensitive items', async () => {
  const ctx = await setupTest();

  const sensitive = await ctx.memory.store.remember({
    text: 'The door code for the spare key box is 4417',
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.markSensitive({
    itemID: sensitive.itemID,
    isSensitive: true,
    provenance: buildMockProvenance(),
  });

  const result = await ctx.memory.store.recall({ query: 'door code' });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([sensitive.itemID]);
});

test('it leaves sensitive items out of a page and out of named items when asked', async () => {
  const ctx = await setupTest();

  const sensitive = await ctx.memory.store.remember({
    text: 'The door code for the spare key box is 4417',
    provenance: buildMockProvenance(),
  });

  const plain = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.markSensitive({
    itemID: sensitive.itemID,
    isSensitive: true,
    provenance: buildMockProvenance(),
  });

  const [page, named] = await Promise.all([
    ctx.memory.store.recall({ excludeSensitive: true }),
    ctx.memory.store.recall({
      itemIDs: [sensitive.itemID, plain.itemID],
      excludeSensitive: true,
    }),
  ]);

  expect(page.items.map((recalled) => recalled.itemID)).toStrictEqual([plain.itemID]);
  expect(named.items.map((recalled) => recalled.itemID)).toStrictEqual([plain.itemID]);
});

test('it recalls an item again in a query that excludes sensitive items once its mark is cleared', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The door code for the spare key box is 4417',
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.markSensitive({
    itemID: item.itemID,
    isSensitive: true,
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.markSensitive({
    itemID: item.itemID,
    isSensitive: false,
    provenance: buildMockProvenance(),
  });

  const result = await ctx.memory.store.recall({ query: 'door code', excludeSensitive: true });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([item.itemID]);
});

test('it leaves the excluded words of a query out of the match when asked', async () => {
  const ctx = await setupTest();

  const bun = await ctx.memory.store.remember({
    text: 'Switched the server scripts from Node to Bun',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Nix booked the dentist for Tuesday',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await ctx.memory.store.recall({
    query: 'nix, what do you think about bun',
    excludedWords: ['Nix'],
  });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([bun.itemID]);
});

test('it finds an unpinned match when more pinned matches rank first than the recall returns', async () => {
  const ctx = await setupTest();

  await Promise.all(
    Array.from({ length: 3 }, (_, index) =>
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
  await ctx.memory.store.remember({ text: 'The library closes early on Tuesday', provenance });
  await ctx.memory.store.remember({ text: 'Waters the ferns every Tuesday', provenance });

  const result = await ctx.memory.store.recall({ query: 'Tuesday flowerpot', minScore: 0.25 });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([flowerpot.itemID]);
});

test('it ranks the next match in place of an excluded version', async () => {
  const ctx = await setupTest();

  const flowerpot = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const garage = await ctx.memory.store.remember({
    text: 'A second spare key hangs in the garage',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await ctx.memory.store.recall({
    query: 'spare key flowerpot',
    limit: 1,
    excludedVersions: [flowerpot],
  });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([garage.itemID]);
});

test('it returns the current version of an item whose earlier version is excluded', async () => {
  const ctx = await setupTest();

  const first = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const edited = await ctx.memory.store.remember({
    text: 'The spare key sits under the doormat',
    target: first,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await ctx.memory.store.recall({ query: 'spare key', excludedVersions: [first] });

  expect(
    result.items.map((recalled) => ({ itemID: recalled.itemID, version: recalled.version })),
  ).toStrictEqual([edited]);
});

test('it recalls none of 3 items for a message unrelated to them', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  await ctx.memory.store.remember({
    text: 'Wants retrieved memories to be relevant to the current message',
    provenance,
  });

  await ctx.memory.store.remember({
    text: 'Drinks oat milk flat whites and no coffee after 2pm',
    provenance,
  });

  await ctx.memory.store.remember({
    text: 'Has a sister called Priya who lives in Lisbon',
    provenance,
  });

  const result = await ctx.memory.store.recall({
    query: 'What should I cook for dinner tonight?',
    limit: 5,
    minScore: 0.25,
    excludePinned: true,
  });

  expect(result.items).toStrictEqual([]);
});

test('it recalls only the 1 of 3 items that a message bears on', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  await ctx.memory.store.remember({
    text: 'Wants retrieved memories to be relevant to the current message',
    provenance,
  });

  await ctx.memory.store.remember({
    text: 'Drinks oat milk flat whites and no coffee after 2pm',
    provenance,
  });

  const sister = await ctx.memory.store.remember({
    text: 'Has a sister called Priya who lives in Lisbon',
    provenance,
  });

  const result = await ctx.memory.store.recall({
    query: 'When is my sister visiting from Lisbon?',
    limit: 5,
    minScore: 0.25,
    excludePinned: true,
  });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([sister.itemID]);
});

test('it recalls neither of 2 items, which BM25 cannot rank, above a score floor', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  await ctx.memory.store.remember({
    text: 'Wants retrieved memories to be relevant to the current message',
    provenance,
  });

  await ctx.memory.store.remember({
    text: 'Drinks oat milk flat whites and no coffee after 2pm',
    provenance,
  });

  const result = await ctx.memory.store.recall({
    query: 'Is it too late for a coffee now? The message can wait',
    limit: 5,
    minScore: 0.25,
    excludePinned: true,
  });

  expect(result.items).toStrictEqual([]);
});

test('it recalls only the train item of 10 for a message that shares function words with others', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  await Promise.all([
    ctx.memory.store.remember({
      text: 'Wants retrieved memories to be relevant to the current message',
      provenance,
    }),
    ctx.memory.store.remember({
      text: 'Drinks oat milk flat whites and no coffee after 2pm',
      provenance,
    }),
    ctx.memory.store.remember({
      text: 'Has a sister called Priya who lives in Lisbon',
      provenance,
    }),
    ctx.memory.store.remember({ text: 'Allergic to hazelnuts and the cat', provenance }),
    ctx.memory.store.remember({ text: 'The dentist is on Tuesday at nine', provenance }),
    ctx.memory.store.remember({ text: 'Works from home on Mondays and Fridays', provenance }),
    ctx.memory.store.remember({ text: 'The library closes at six on Sundays', provenance }),
    ctx.memory.store.remember({
      text: 'The spare key sits under the blue flowerpot',
      provenance,
    }),
    ctx.memory.store.remember({ text: 'Waters the ferns every Tuesday', provenance }),
  ]);

  const train = await ctx.memory.store.remember({
    text: 'Prefers window seats on trains',
    provenance,
  });

  const result = await ctx.memory.store.recall({
    query: 'I need to book a train to Manchester next week',
    limit: 5,
    minScore: 0.25,
    excludePinned: true,
  });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([train.itemID]);
});

test('it recalls only the coffee item of 10 for a message that shares function words with others', async () => {
  const ctx = await setupTest();

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  await Promise.all([
    ctx.memory.store.remember({
      text: 'Wants retrieved memories to be relevant to the current message',
      provenance,
    }),
    ctx.memory.store.remember({
      text: 'Has a sister called Priya who lives in Lisbon',
      provenance,
    }),
    ctx.memory.store.remember({ text: 'Allergic to hazelnuts and the cat', provenance }),
    ctx.memory.store.remember({ text: 'Prefers window seats on trains', provenance }),
    ctx.memory.store.remember({ text: 'The dentist is on Tuesday at nine', provenance }),
    ctx.memory.store.remember({ text: 'Works from home on Mondays and Fridays', provenance }),
    ctx.memory.store.remember({ text: 'The library closes at six on Sundays', provenance }),
    ctx.memory.store.remember({
      text: 'The spare key sits under the blue flowerpot',
      provenance,
    }),
    ctx.memory.store.remember({ text: 'Waters the ferns every Tuesday', provenance }),
  ]);

  const coffee = await ctx.memory.store.remember({
    text: 'Drinks oat milk flat whites and no coffee after 2pm',
    provenance,
  });

  const result = await ctx.memory.store.recall({
    query: 'Is it too late for a coffee now?',
    limit: 5,
    minScore: 0.25,
    excludePinned: true,
  });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([coffee.itemID]);
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

test("it marks a turn note's recall record as the turn note's", async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.recall({
    itemIDs: [item.itemID],
    thread: 'conversation',
    isTurnNote: true,
  });

  const [recalled] = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.recalled'],
  });

  expect(recalled?.record.payload).toStrictEqual({
    items: [{ itemID: item.itemID, version: 1 }],
    isTurnNote: true,
  });
});

test('it leaves the turn note mark off a recall record that did not ask for it', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'The spare key sits under the blue flowerpot',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.recall({ itemIDs: [item.itemID], thread: 'conversation' });

  const [recalled] = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.recalled'],
  });

  expect(recalled?.record.payload).toStrictEqual({
    items: [{ itemID: item.itemID, version: 1 }],
  });
});

test('it records the match score of each item a query delivered', async () => {
  const ctx = await setupTest();

  const both = await ctx.memory.store.remember({
    text: 'The library on Elm Street closes at six on Sundays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const one = await ctx.memory.store.remember({
    text: 'The library closes at six',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Allergic to hazelnuts',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.recall({ query: 'Sundays library', thread: 'conversation' });

  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(records.at(-1)?.record.payload).toStrictEqual({
    items: [
      { itemID: both.itemID, version: 1, score: expect.toBePositive() },
      { itemID: one.itemID, version: 1, score: expect.toBePositive() },
    ],
    searchMode: 'keyword',
  });
});

test('it records no score for items recalled by ID', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.recall({ itemIDs: [item.itemID] });

  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(records.at(-1)?.record.payload).toStrictEqual({
    items: [{ itemID: item.itemID, version: 1 }],
  });
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

test('it delivers and records an item named at its current version', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await ctx.memory.store.recall({ versions: [item], thread: 'conversation' });
  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(result.items).toMatchObject([
    { itemID: item.itemID, version: 1, text: 'Lives on Elm Street' },
  ]);

  expect(records.at(-1)?.record).toMatchObject({
    kind: 'memory.recalled',
    payload: { items: [{ itemID: item.itemID, version: 1 }] },
  });
});

test('it leaves out an item named at a version that is no longer current, and records none of it', async () => {
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

  const result = await ctx.memory.store.recall({ versions: [item], thread: 'conversation' });
  const records = await readRecords(ctx.memory.log, { afterSequence: 0 });

  expect(result.items).toStrictEqual([]);

  expect(records.at(-1)?.record).toMatchObject({
    kind: 'memory.recalled',
    payload: { items: [] },
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
  expect(result).toStrictEqual({ items: [], next: null, searchMode: 'keyword' });
});

test('it recalls an item that shares no word with the query through the vector index', async () => {
  const memory = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([['sister', 'sibling'], ['leeds'], ['boiler', 'heating']]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  const sister = await createMemoryItem(memory.store, { text: 'Ana is my sister' });

  await createMemoryItem(memory.store, { text: 'The boiler service is on the 14th' });

  await memory.store.waitForSemanticIndex();

  const result = await memory.store.recall({ query: 'who is my sibling' });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([sister.itemID]);
  expect(result.searchMode).toBe('hybrid');
});

test('it recalls the keyword matches alone while the vector index rebuilds', async () => {
  const first = await startTestMemory();
  const sister = await createMemoryItem(first.store, { text: 'My sister lives in Leeds' });

  await createMemoryItem(first.store, { text: 'Ana is my sibling' });

  const gated = makeGatedCall(buildStubEncoder([['sister', 'sibling'], ['leeds']]).encode);

  const memory = await startNextTestMemory(first, {
    semanticSearch: { encoder: { encode: gated.call }, onError: mock<(error: unknown) => void>() },
  });

  await gated.started;

  const result = await memory.store.recall({
    query: 'where does my sister live now',
    excludePinned: true,
    minSimilarity: 0.38,
  });

  gated.release();

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([sister.itemID]);
  expect(result.searchMode).toBe('keyword-fallback');
});

test('it records each item keyword score and similarity, and how the query searched', async () => {
  const memory = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([['sister', 'sibling'], ['leeds']]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  const both = await createMemoryItem(memory.store, { text: 'My sister lives in Leeds' });
  const meaning = await createMemoryItem(memory.store, { text: 'Ana is my sibling' });

  await createMemoryItem(memory.store, { text: 'The library closes at six on Sundays' });

  await memory.store.waitForSemanticIndex();
  await memory.store.recall({ query: 'my sister', thread: 'conversation' });

  const [recalled] = await readRecords(memory.log, {
    afterSequence: 0,
    kinds: ['memory.recalled'],
  });

  expect(recalled?.record.payload).toStrictEqual({
    items: [
      {
        itemID: both.itemID,
        version: 1,
        score: expect.toBeNumber(),
        similarity: expect.toBeWithin(0.7, 0.72),
      },
      { itemID: meaning.itemID, version: 1, similarity: expect.toBeWithin(0.99, 1.02) },
    ],
    searchMode: 'hybrid',
  });
});

test('it leaves the excluded words out of the vector query', async () => {
  const memory = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([['nix'], ['ferns']]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  await createMemoryItem(memory.store, { text: 'Nix waters the ferns on Fridays' });

  await memory.store.waitForSemanticIndex();

  const result = await memory.store.recall({ query: 'Nix?', excludedWords: ['Nix'] });

  expect(result.items).toStrictEqual([]);
});

test('it leaves out a semantic match below the similarity floor the request sets', async () => {
  const memory = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([['sister', 'sibling'], ['leeds']]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  await createMemoryItem(memory.store, { text: 'Ana is my sibling' });

  await memory.store.waitForSemanticIndex();

  const result = await memory.store.recall({
    query: 'is my sister in leeds',
    minSimilarity: 0.8,
  });

  expect(result.items).toStrictEqual([]);
});

test('it keeps a pinned item out of the vector matches when the request leaves pinned items out', async () => {
  const memory = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([['sister', 'sibling']]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  const pinned = await createMemoryItem(memory.store, { text: 'Ana is my sibling' });
  const other = await createMemoryItem(memory.store, { text: 'Ana is my only sibling' });

  await memory.store.pin({
    itemID: pinned.itemID,
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.waitForSemanticIndex();

  const result = await memory.store.recall({ query: 'my sister', excludePinned: true, limit: 1 });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([other.itemID]);
});

test('it ranks the next semantic match in place of a retired item', async () => {
  const memory = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([['sister', 'sibling']]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  const retired = await createMemoryItem(memory.store, { text: 'Ana is my sibling' });
  const kept = await createMemoryItem(memory.store, { text: 'Ana is my only sibling' });

  await memory.store.retire({
    target: retired,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.waitForSemanticIndex();

  const result = await memory.store.recall({ query: 'my sister', limit: 1 });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([kept.itemID]);
});

test('it recalls an edited item by the meaning of its new text', async () => {
  const memory = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([
        ['sister', 'sibling'],
        ['boiler', 'heating'],
      ]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  const item = await createMemoryItem(memory.store, { text: 'Ana is my sister' });

  await memory.store.remember({
    target: item,
    text: 'The boiler service is on the 14th',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.waitForSemanticIndex();

  const result = await memory.store.recall({ query: 'when is the heating looked at' });

  expect(result.items.map((recalled) => [recalled.itemID, recalled.version])).toStrictEqual([
    [item.itemID, 2],
  ]);
});

test('it drops an item from search and from the listing at its end time, before any sweep runs', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    provenance: buildMockProvenance(),
  });

  await memory.store.remember({ text: 'Lives in Bristol', provenance: buildMockProvenance() });

  clock.advance(Date.parse('2026-10-19T22:59:59Z') - clock.now());

  const searched = await memory.store.recall({ query: 'Lisbon' });
  const listed = await memory.store.recall({});

  expect(searched.items).toStrictEqual([]);
  expect(listed.items.map((recalled) => recalled.text)).toStrictEqual(['Lives in Bristol']);
});

test('it keeps an item in search until its end time', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    provenance: buildMockProvenance(),
  });

  clock.advance(Date.parse('2026-10-19T22:59:58Z') - clock.now());

  const searched = await memory.store.recall({ query: 'Lisbon' });

  expect(searched.items.map((recalled) => recalled.text)).toStrictEqual(['Is in Lisbon this week']);
});

test('it fills a listing page with a live item when an item past its end time comes first', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    provenance: buildMockProvenance(),
  });

  await memory.store.remember({ text: 'Lives in Bristol', provenance: buildMockProvenance() });

  clock.advance(Date.parse('2026-10-20T00:41:00Z') - clock.now());

  const listed = await memory.store.recall({ limit: 1 });

  expect(listed.items.map((recalled) => recalled.text)).toStrictEqual(['Lives in Bristol']);
});

test('it ranks a live match in place of a better match past its end time', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    provenance: buildMockProvenance(),
  });

  await memory.store.remember({
    text: 'Has a cousin who moved to Lisbon for work last spring',
    provenance: buildMockProvenance(),
  });

  clock.advance(Date.parse('2026-10-20T00:41:00Z') - clock.now());

  const searched = await memory.store.recall({ query: 'Lisbon this week', limit: 1 });

  expect(searched.items.map((recalled) => recalled.text)).toStrictEqual([
    'Has a cousin who moved to Lisbon for work last spring',
  ]);
});

test('it returns a pinned item past its end time to a query that leaves pinned items out and includes retired items', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  clock.advance(Date.parse('2026-10-20T00:41:00Z') - clock.now());

  const searched = await memory.store.recall({
    query: 'Lisbon',
    excludePinned: true,
    includeRetired: true,
  });

  expect(searched.items).toMatchObject([
    { itemID: item.itemID, state: 'retired', isPinned: false },
  ]);
});

test('it returns an item past its end time as retired to a recall that includes retired items', async () => {
  const clock = buildTestClock(Date.parse('2026-10-19T09:00:00Z'));

  const memory = await startTestMemory({ gate: { clock } });

  const item = await memory.store.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2026-10-19T22:59:59Z'),
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  clock.advance(Date.parse('2026-10-20T00:41:00Z') - clock.now());

  const result = await memory.store.recall({ itemIDs: [item.itemID], includeRetired: true });

  expect(result.items).toMatchObject([
    { itemID: item.itemID, state: 'retired', isPinned: false, text: 'Is in Lisbon this week' },
  ]);
});

test('it returns no moment text to the recall that per-turn retrieval makes, even for an item linked to a moment', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the quiet kettle wins' },
    },
  ]);

  invariant(message);

  const item = await ctx.memory.store.remember({
    text: 'Buys only quiet kettles',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Kettle noise ruling',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'reflection', text: 'Kettle noise outweighed the price.' },
  });

  await ctx.memory.store.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 2 },
    itemID: item.itemID,
    isLinked: true,
  });

  const result = await ctx.memory.store.recall({
    query: 'kettle noise ruling',
    limit: 5,
    selfNoteLimit: 2,
    excludePinned: true,
    thread: 'conversation',
  });

  expect(result.items.map((recalled) => recalled.itemID)).toStrictEqual([item.itemID]);
  expect(JSON.stringify(result)).not.toInclude('noise');
});
