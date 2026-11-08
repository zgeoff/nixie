import { expect, mock, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { makeGatedCall } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { buildStubEncoder } from './test-utils/build-stub-encoder';
import { startNextTestMemory } from './test-utils/start-next-test-memory';
import type { TestMemoryOptions } from './test-utils/start-test-memory';
import { startTestMemory } from './test-utils/start-test-memory';

async function setupTest() {
  const memory = await startTestMemory({
    semanticSearch: {
      encoder: buildStubEncoder([
        ['boiler', 'heating', 'furnace'],
        ['canal', 'river'],
      ]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  return {
    memory,
    restart: (options: TestMemoryOptions) => startNextTestMemory(memory, options),
  };
}

test('it finds the oldest moment by a word that only it holds, behind more than 100 newer moments', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the pond froze over in one night' },
    },
  ]);

  invariant(message);

  await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The pond with the heron',
  });

  await Promise.all(
    Array.from({ length: 120 }, (_, index) =>
      ctx.memory.store.moments.keep({
        caller: { kind: 'owner' },
        thread: 'conversation',
        firstSequence: message.sequence,
        lastSequence: message.sequence,
        title: `Week ${String(index)} in the garden`,
      }),
    ),
  );

  const page = await ctx.memory.store.moments.readMatches({
    query: 'heron',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  expect(page.matches.map((match) => match.title)).toStrictEqual(['The pond with the heron']);
  expect(page.next).toBeNull();
});

test('it ranks a moment that matches more of the words first', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the pond froze over in one night' },
    },
  ]);

  invariant(message);

  for (const title of ['The frozen pond', 'The heron on the frozen pond', 'A heron at dawn']) {
    await ctx.memory.store.moments.keep({
      caller: { kind: 'owner' },
      thread: 'conversation',
      firstSequence: message.sequence,
      lastSequence: message.sequence,
      title,
    });
  }

  const page = await ctx.memory.store.moments.readMatches({
    query: 'heron pond',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 1,
  });

  expect(page.matches.map((match) => match.title)).toStrictEqual(['The heron on the frozen pond']);
});

test('it finds a moment by a paraphrase that shares no word with its title, note or reflections', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.waitForSemanticIndex();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  for (const title of ['Boiler service booked', 'A walk by the old mill']) {
    await ctx.memory.store.moments.keep({
      caller: { kind: 'owner' },
      thread: 'conversation',
      firstSequence: message.sequence,
      lastSequence: message.sequence,
      title,
    });
  }

  const page = await ctx.memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  expect(page).toStrictEqual({
    matches: [{ row: expect.any(Object), title: 'Boiler service booked' }],
    next: null,
  });
});

test('it misses the same paraphrase by keyword alone when no encoder is wired', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Boiler service booked',
  });

  const memory = await ctx.restart({});

  const page = await memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  expect(page).toStrictEqual({ matches: [], next: null });
});

test('it ranks a moment that matches by keyword and by meaning above one that matches by meaning alone', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.waitForSemanticIndex();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  for (const title of ['Boiler service booked', 'Heating engineer at nine']) {
    await ctx.memory.store.moments.keep({
      caller: { kind: 'owner' },
      thread: 'conversation',
      firstSequence: message.sequence,
      lastSequence: message.sequence,
      title,
    });
  }

  const page = await ctx.memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  expect(page.matches).toStrictEqual([
    { row: expect.objectContaining({ kept_by: 'owner' }), title: 'Heating engineer at nine' },
    { row: expect.objectContaining({ kept_by: 'owner' }), title: 'Boiler service booked' },
  ]);
});

test('it finds a moment kept before a restart by meaning once the index rebuilds', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Boiler service booked',
  });

  const memory = await ctx.restart({
    semanticSearch: {
      encoder: buildStubEncoder([['boiler', 'heating']]),
      onError: mock<(error: unknown) => void>(),
    },
  });

  await memory.store.waitForSemanticIndex();

  const page = await memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  expect(page.matches.map((match) => match.title)).toStrictEqual(['Boiler service booked']);
});

test('it finds a moment by the meaning of its new title after an edit', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.waitForSemanticIndex();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Boiler service booked',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'title', title: 'Walk along the canal' },
  });

  const page = await ctx.memory.store.moments.readMatches({
    query: 'river stroll',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  expect(page.matches.map((match) => match.title)).toStrictEqual(['Walk along the canal']);
});

test.each([
  { includeRetired: false, titles: [] },
  { includeRetired: true, titles: ['Boiler service booked'] },
])(
  'it finds a retired moment by meaning only when the search includes retired ones: includeRetired $includeRetired',
  async (row) => {
    const ctx = await setupTest();

    await ctx.memory.store.waitForSemanticIndex();

    const [message] = await writeRecords(ctx.memory.log, [
      {
        kind: 'owner_message',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        erasable: { text: 'booked it for the ninth' },
      },
    ]);

    invariant(message);

    const kept = await ctx.memory.store.moments.keep({
      caller: { kind: 'owner' },
      thread: 'conversation',
      firstSequence: message.sequence,
      lastSequence: message.sequence,
      title: 'Boiler service booked',
    });

    invariant(kept.status === 'written');

    await ctx.memory.store.moments.retire({
      caller: { kind: 'owner' },
      target: { momentID: kept.momentID, version: 1 },
      isRetired: true,
    });

    const page = await ctx.memory.store.moments.readMatches({
      query: 'heating engineer visit',
      from: null,
      to: null,
      includeRetired: row.includeRetired,
      before: null,
      limit: 10,
    });

    expect(page.matches.map((match) => match.title)).toStrictEqual([...row.titles]);
  },
);

test('it no longer finds a destroyed moment by meaning', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.waitForSemanticIndex();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Boiler service booked',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: true,
    before: null,
    limit: 10,
  });

  await ctx.memory.store.moments.destroy({ momentID: kept.momentID, version: 1 });

  const page = await ctx.memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: true,
    before: null,
    limit: 10,
  });

  expect(page.matches).toStrictEqual([]);
});

test('it finds moments by keyword alone while the index rebuilds after a start', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  for (const title of ['Boiler service booked', 'Heating engineer at nine']) {
    await ctx.memory.store.moments.keep({
      caller: { kind: 'owner' },
      thread: 'conversation',
      firstSequence: message.sequence,
      lastSequence: message.sequence,
      title,
    });
  }

  const gated = makeGatedCall(buildStubEncoder([['boiler', 'heating']]).encode);

  const memory = await ctx.restart({
    semanticSearch: { encoder: { encode: gated.call }, onError: mock<(error: unknown) => void>() },
  });

  await gated.started;

  const page = await memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  gated.release();

  expect(page.matches.map((match) => match.title)).toStrictEqual(['Heating engineer at nine']);
});

test('it finds a moment by the meaning of a reflection', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.waitForSemanticIndex();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Booked for the ninth',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'reflection', text: 'The furnace had failed twice that winter.' },
  });

  const page = await ctx.memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  expect(page.matches.map((match) => match.title)).toStrictEqual(['Booked for the ninth']);
});

test('it no longer finds a moment by the meaning of a reflection the user removed', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.waitForSemanticIndex();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Booked for the ninth',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'reflection', text: 'The furnace had failed twice that winter.' },
  });

  await ctx.memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  const view = await ctx.memory.store.moments.readView(kept.momentID);

  const reflectionID = view?.reflections[0]?.reflectionID;

  invariant(reflectionID !== undefined);

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 2 },
    change: { kind: 'reflection_removed', reflectionID },
  });

  const page = await ctx.memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  expect(page.matches).toStrictEqual([]);
});

test('it no longer finds a moment by the meaning of its old title after an edit', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.waitForSemanticIndex();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Boiler service booked',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'title', title: 'Walk along the canal' },
  });

  const page = await ctx.memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  expect(page.matches).toStrictEqual([]);
});

test('it finds a restored moment by meaning again', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.waitForSemanticIndex();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Boiler service booked',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.retire({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    isRetired: true,
  });

  await ctx.memory.store.moments.retire({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 2 },
    isRetired: false,
  });

  const page = await ctx.memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: null,
    to: null,
    includeRetired: false,
    before: null,
    limit: 10,
  });

  expect(page.matches.map((match) => match.title)).toStrictEqual(['Boiler service booked']);
});

test('it leaves a moment kept outside from and to out of a search by meaning', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.waitForSemanticIndex();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'booked it for the ninth' },
    },
  ]);

  invariant(message);

  await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Boiler service booked',
  });

  const page = await ctx.memory.store.moments.readMatches({
    query: 'heating engineer visit',
    from: Date.parse('2001-01-01T00:00:00Z'),
    to: Date.parse('2001-02-01T00:00:00Z'),
    includeRetired: false,
    before: null,
    limit: 10,
  });

  expect(page.matches).toStrictEqual([]);
});
