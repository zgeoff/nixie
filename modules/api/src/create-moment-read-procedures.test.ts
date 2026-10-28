import { expect, mock, onTestFinished, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import type { CleanupSessions } from '@heynixie/memory';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  startMemoryStore,
} from '@heynixie/memory';
import invariant from 'tiny-invariant';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();

  const memory = await startMemoryStore({
    log: api.context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    cleanupSessions: mock<CleanupSessions>(() => Promise.resolve()),
    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'unsure',
          reason: 'no checker is wired',
          model: 'no-checker',
          failure: 'error',
        }),
      clock: api.clock,
      defaultZone: 'UTC',
      findAllowRule: findNoAllowRule,
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  onTestFinished(() => memory.stop());

  api.setMemory(memory);

  return { ...api, memory };
}

test('#memory.listMoments lists the active moments, newest first, with their titles', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the cat learned the flap today' },
    },
  ]);

  invariant(message);

  const first = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The cat flap',
  });

  const second = await ctx.memory.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The first night out',
  });

  invariant(first.status === 'written' && second.status === 'written');

  const listed = await buildTestClient(ctx.url, laptop.token).memory.listMoments({
    includeRetired: false,
  });

  expect(listed).toStrictEqual({
    moments: [
      {
        editedAt: null,
        keptAt: expect.any(Date),
        keptBy: 'model',
        momentID: second.momentID,
        shortID: second.shortID,
        state: 'active',
        title: 'The first night out',
      },
      {
        editedAt: null,
        keptAt: expect.any(Date),
        keptBy: 'owner',
        momentID: first.momentID,
        shortID: first.shortID,
        state: 'active',
        title: 'The cat flap',
      },
    ],
    next: null,
  });
});

test('#memory.listMoments shows a retired moment only when the filter asks for it', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the cat learned the flap today' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The cat flap',
  });

  invariant(kept.status === 'written');

  await ctx.memory.moments.retire({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    isRetired: true,
  });

  const active = await client.memory.listMoments({ includeRetired: false });
  const all = await client.memory.listMoments({ includeRetired: true });

  expect(active.moments).toStrictEqual([]);

  expect(all.moments.map((moment) => [moment.shortID, moment.state])).toStrictEqual([
    [kept.shortID, 'retired'],
  ]);
});

test('#memory.listMoments finds a moment by a word of its note', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the cat learned the flap today' },
    },
  ]);

  invariant(message);

  const noted = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The cat flap',
  });

  await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The first night out',
  });

  invariant(noted.status === 'written');

  await ctx.memory.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: noted.momentID, version: 1 },
    change: { kind: 'note', note: 'Patience with treats worked.' },
  });

  const found = await buildTestClient(ctx.url, laptop.token).memory.listMoments({
    includeRetired: false,
    query: 'treats',
  });

  expect(found.moments.map((moment) => moment.shortID)).toStrictEqual([noted.shortID]);
});

test('#memory.listMoments ends a full page with the cursor of the next', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the cat learned the flap today' },
    },
  ]);

  invariant(message);

  for (let index = 0; index < 51; index += 1) {
    await ctx.memory.moments.keep({
      caller: { kind: 'owner' },
      thread: 'conversation',
      firstSequence: message.sequence,
      lastSequence: message.sequence,
      title: `Cat flap day ${String(index + 1)}`,
    });
  }

  const first = await client.memory.listMoments({ includeRetired: false });

  invariant(first.next !== null);

  const second = await client.memory.listMoments({ includeRetired: false, before: first.next });

  expect(first.moments).toHaveLength(50);
  expect(second.moments.map((moment) => moment.title)).toStrictEqual(['Cat flap day 1']);
  expect(second.next).toBeNull();
});

test('#memory.listMoments refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const listed = buildTestClient(ctx.url, 'not-a-session').memory.listMoments({
    includeRetired: false,
  });

  await listed.catch(() => {});

  expect(listed).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#memory.listMoments answers a signed-in caller with MEMORY_NOT_STARTED before the store starts', async () => {
  const ctx = await startTestAPI();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const listed = buildTestClient(ctx.url, laptop.token).memory.listMoments({
    includeRetired: false,
  });

  await listed.catch(() => {});

  expect(listed).rejects.toMatchObject({ code: 'MEMORY_NOT_STARTED' });
});

test('#memory.readMoment shows the dated note, each labelled reflection, the links and who wrote the title', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the cat learned the flap today' },
    },
  ]);

  invariant(message);

  const item = await ctx.memory.remember({
    text: 'Feeds the cat at six',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The cat flap',
  });

  invariant(kept.status === 'written');

  const reflected = await ctx.memory.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'reflection', text: 'Treats did the teaching.' },
  });

  invariant(reflected.status === 'written' && reflected.reflectionID !== undefined);

  await ctx.memory.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 2 },
    change: { kind: 'note', note: 'Patience with treats worked.' },
  });

  await ctx.memory.moments.link({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 3 },
    itemID: item.itemID,
    isLinked: true,
  });

  const shortIDs = await ctx.memory.readShortIDs([item.itemID]);

  const shortID = shortIDs.get(item.itemID);

  invariant(shortID !== undefined);

  const read = await buildTestClient(ctx.url, laptop.token).memory.readMoment({
    momentID: kept.momentID,
  });

  expect(read).toStrictEqual({
    editedAt: expect.any(Date),
    firstSequence: message.sequence,
    keptAt: expect.any(Date),
    keptBy: 'model',
    lastSequence: message.sequence,
    links: [{ itemID: item.itemID, shortID, text: 'Feeds the cat at six' }],
    momentID: kept.momentID,
    note: { text: 'Patience with treats worked.', writtenAt: expect.any(Date) },
    reflections: [
      {
        model: 'claude-test-4',
        reflectionID: reflected.reflectionID,
        text: 'Treats did the teaching.',
        writtenAt: expect.any(Date),
      },
    ],
    shortID: kept.shortID,
    state: 'active',
    thread: 'conversation',
    title: 'The cat flap',
    titleBy: 'model',
    version: 4,
  });
});

test('#memory.readMoment refuses a destroyed moment', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the cat learned the flap today' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The cat flap',
  });

  invariant(kept.status === 'written');

  await ctx.memory.moments.destroy({ momentID: kept.momentID, version: 1 });

  const read = buildTestClient(ctx.url, laptop.token).memory.readMoment({
    momentID: kept.momentID,
  });

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ code: 'MOMENT_NOT_FOUND' });
});

test("#memory.readMomentSpan reads the span's records in order, with a forgotten message as a gap", async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [before, message, aside, reply] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the cat is out again' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the cat learned the flap today' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'morning-reading',
      erasable: { text: 'a story about foxes' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Treats will keep it coming back.' },
    },
  ]);

  invariant(before && message && aside && reply);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: reply.sequence,
    title: 'The cat flap',
  });

  invariant(kept.status === 'written');

  await client.conversation.forget({
    clientActionID: '4c9e2a71-5b3d-4f8e-a06c-1d7b3e9f2a58',
    thread: 'conversation',
    sequence: message.sequence,
  });

  const span = await client.memory.readMomentSpan({ momentID: kept.momentID });

  expect(span).toStrictEqual({
    records: [
      {
        isGap: true,
        kind: 'owner_message',
        recordedAt: expect.any(Date),
        sequence: message.sequence,
        text: null,
        tool: null,
      },
      {
        isGap: false,
        kind: 'model.reply',
        recordedAt: expect.any(Date),
        sequence: reply.sequence,
        text: 'Treats will keep it coming back.',
        tool: null,
      },
    ],
    next: null,
  });
});

test('#memory.readMomentSpan reads a long span a page at a time', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const written = await writeRecords(
    ctx.context.log,
    Array.from({ length: 101 }, (_, index) => ({
      kind: 'owner_message' as const,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: `the cat came in, take ${String(index + 1)}` },
    })),
  );

  const first = written.at(0);
  const last = written.at(-1);

  invariant(first && last);

  const kept = await ctx.memory.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: first.sequence,
    lastSequence: last.sequence,
    title: 'The cat flap',
  });

  invariant(kept.status === 'written');

  const page = await client.memory.readMomentSpan({ momentID: kept.momentID });

  invariant(page.next !== null);

  const rest = await client.memory.readMomentSpan({ momentID: kept.momentID, after: page.next });

  expect(page.records).toHaveLength(100);
  expect(rest.records.map((record) => record.text)).toStrictEqual(['the cat came in, take 101']);
  expect(rest.next).toBeNull();
});

test.each([
  ['no session token', undefined],
  ['a token that no session holds', 'f3a9c1e2b7d84605a1c9e2f3b4d5c6a7'],
  ['an empty bearer token', ''],
])(
  "#memory.readMoment refuses a caller with %s, and shows none of the moment's text",
  async (_, token) => {
    const ctx = await setupTest();

    const [message] = await writeRecords(ctx.context.log, [
      {
        kind: 'owner_message',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        erasable: { text: 'the cat learned the flap today' },
      },
    ]);

    invariant(message);

    const kept = await ctx.memory.moments.keep({
      caller: { kind: 'owner' },
      thread: 'conversation',
      firstSequence: message.sequence,
      lastSequence: message.sequence,
      title: 'The cat flap',
    });

    invariant(kept.status === 'written');

    const read = buildTestClient(ctx.url, token).memory.readMoment({ momentID: kept.momentID });

    await read.catch(() => {});

    expect(read).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  },
);

test.each([
  ['no session token', undefined],
  ['a token that no session holds', 'f3a9c1e2b7d84605a1c9e2f3b4d5c6a7'],
  ['an empty bearer token', ''],
])(
  "#memory.readMomentSpan refuses a caller with %s, and shows none of the span's records",
  async (_, token) => {
    const ctx = await setupTest();

    const [message] = await writeRecords(ctx.context.log, [
      {
        kind: 'owner_message',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        erasable: { text: 'the cat learned the flap today' },
      },
    ]);

    invariant(message);

    const kept = await ctx.memory.moments.keep({
      caller: { kind: 'owner' },
      thread: 'conversation',
      firstSequence: message.sequence,
      lastSequence: message.sequence,
      title: 'The cat flap',
    });

    invariant(kept.status === 'written');

    const span = buildTestClient(ctx.url, token).memory.readMomentSpan({ momentID: kept.momentID });

    await span.catch(() => {});

    expect(span).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  },
);

test('#memory.readMomentSpan refuses a moment that does not exist', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const span = buildTestClient(ctx.url, laptop.token).memory.readMomentSpan({
    momentID: 'zzzzzzzzzz',
  });

  await span.catch(() => {});

  expect(span).rejects.toMatchObject({ code: 'MOMENT_NOT_FOUND' });
});
