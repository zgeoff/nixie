import { expect, onTestFinished, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  startMemoryStore,
} from '@heynixie/memory';
import { createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();

  const memory = await startMemoryStore({
    log: api.context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    cleanupSessions: () => Promise.resolve(),
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

test('#memory.listItems lists each active item with its text, origin, source and dates', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const page = await buildTestClient(ctx.url, laptop.token).memory.listItems({ state: 'active' });

  expect(page).toStrictEqual({
    items: [
      {
        itemID: item.itemID,
        shortID: expect.toBeString(),
        state: 'active',
        isPinned: false,
        isSensitive: false,
        kind: 'fact',
        subject: 'owner',
        version: 1,
        origin: 'owner',
        source: 'owner',
        createdAt: expect.toBeValidDate(),
        changedAt: expect.toBeValidDate(),
        forgottenAt: null,
        until: null,
        status: 'readable',
        text: 'Plays the cello on Thursdays',
      },
    ],
    next: null,
  });
});

test('#memory.listItems gives the end time of an item as a date', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  await ctx.memory.remember({
    text: 'Is in Lisbon this week',
    until: Date.parse('2099-01-04T23:59:59Z'),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const page = await buildTestClient(ctx.url, laptop.token).memory.listItems({ state: 'active' });

  expect(page.items).toMatchObject([{ until: new Date('2099-01-04T23:59:59Z') }]);
});

test('#memory.listItems lists a forgotten item as a dated gap with no text', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Owes Robin twenty pounds',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const page = await buildTestClient(ctx.url, laptop.token).memory.listItems({
    state: 'forgotten',
  });

  expect(page.items).toMatchObject([
    {
      itemID: item.itemID,
      state: 'forgotten',
      status: 'shredded',
      forgottenAt: expect.toBeValidDate(),
    },
  ]);

  expect(page.items[0]).not.toContainKey('text');
});

test('#memory.listItems lists a self-note with its subject', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Finds a well-made timetable oddly satisfying',
    subject: 'self',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const page = await buildTestClient(ctx.url, laptop.token).memory.listItems({ state: 'active' });

  expect(page.items).toMatchObject([{ itemID: item.itemID, subject: 'self', kind: 'self' }]);
});

test('#memory.listItems lists a shared item with its subject and the fact kind', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'The owner and the assistant call the kettle Captain Steam',
    subject: 'shared',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const page = await buildTestClient(ctx.url, laptop.token).memory.listItems({ state: 'active' });

  expect(page.items).toMatchObject([{ itemID: item.itemID, subject: 'shared', kind: 'fact' }]);
});

test('#memory.listItems lists only the facts when asked for the fact kind', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const owned = await ctx.memory.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.remember({
    text: 'Finds a well-made timetable oddly satisfying',
    subject: 'self',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const shared = await ctx.memory.remember({
    text: 'The owner and the assistant call the kettle Captain Steam',
    subject: 'shared',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const page = await buildTestClient(ctx.url, laptop.token).memory.listItems({
    state: 'active',
    kind: 'fact',
  });

  expect(page.items.map((item) => item.itemID)).toStrictEqual([shared.itemID, owned.itemID]);
});

test('#memory.listItems lists only the self-notes when asked for the self kind', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  await ctx.memory.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const note = await ctx.memory.remember({
    text: 'Finds a well-made timetable oddly satisfying',
    subject: 'self',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const page = await buildTestClient(ctx.url, laptop.token).memory.listItems({
    state: 'active',
    kind: 'self',
  });

  expect(page.items.map((item) => item.itemID)).toStrictEqual([note.itemID]);
});

test('#memory.findItems finds a self-note with its subject', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Finds a well-made timetable oddly satisfying',
    subject: 'self',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const found = await buildTestClient(ctx.url, laptop.token).memory.findItems({
    query: 'timetable',
  });

  expect(found.items).toMatchObject([{ itemID: item.itemID, subject: 'self', kind: 'self' }]);
});

test('#memory.listItems refuses a cursor that no page returned', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const read = buildTestClient(ctx.url, laptop.token).memory.listItems({
    state: 'active',
    after: 'page-two',
  });

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ code: 'INVALID_CURSOR' });
});

test('#memory.listItems refuses a caller with no session', async () => {
  const ctx = await setupTest();

  const read = buildTestClient(ctx.url).memory.listItems({ state: 'active' });

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#memory.findItems finds an active item by a word in its text', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.remember({
    text: 'Rents a flat on Mill Lane',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.remember({
    text: 'Drinks oat milk',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const found = await buildTestClient(ctx.url, laptop.token).memory.findItems({ query: 'cello' });

  expect(found).toMatchObject({
    items: [
      { itemID: item.itemID, text: 'Plays the cello on Thursdays', score: expect.toBeNumber() },
    ],
    searchMode: 'keyword',
  });

  expect(found.items).toHaveLength(1);
});

test('#memory.readPinnedCore reads the pinned items with the core size against its budget', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const item = await ctx.memory.remember({
    text: 'Is allergic to peanuts',
    isPinned: true,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const core = await buildTestClient(ctx.url, laptop.token).memory.readPinnedCore();

  expect(core).toMatchObject({
    items: [{ itemID: item.itemID, isPinned: true, text: 'Is allergic to peanuts' }],
    tokens: expect.toBeWithin(1, 2000),
    budget: 2000,
  });
});

test("#memory.readItem reads a version's quote inside the message it came from", async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const sent = await client.conversation.send({
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    spans: [{ start: 0, end: 44, source: 'typed' }],
    text: 'Quick one: my sister Ana lives in Porto now.',
    thread: 'conversation',
  });

  const item = await ctx.memory.remember({
    text: "The user's sister Ana lives in Porto",
    evidenceQuote: 'my sister Ana lives in Porto',
    evidence: { recordSequence: sent.sequence, start: 11, end: 39 },
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: 'memory-writer',
      proposalID: null,
      checks: { checker: { verdict: 'asserted', model: 'checker-model-1', failure: null } },
      model: 'writer-model-1',
    },
  });

  const detail = await client.memory.readItem({ itemID: item.itemID });

  expect(detail.versions).toStrictEqual([
    {
      version: 1,
      change: 'created',
      state: 'active',
      origin: 'memory_writer',
      source: 'owner',
      recordedAt: expect.toBeValidDate(),
      taskID: 'memory-writer',
      proposalID: null,
      checks: { checker: { verdict: 'asserted', model: 'checker-model-1', failure: null } },
      writerModel: 'writer-model-1',
      checkerModel: 'checker-model-1',
      evidenceQuote: 'my sister Ana lives in Porto',
      evidence: {
        sequence: sent.sequence,
        start: 11,
        end: 39,
        message: { status: 'readable', text: 'Quick one: my sister Ana lives in Porto now.' },
      },
      image: null,
      status: 'readable',
      text: "The user's sister Ana lives in Porto",
    },
  ]);
});

test('#memory.readItem reads an approved photo version with the thread, sequence and position of its image', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const [photo] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      payload: { images: [{ mediaType: 'image/png' }, { mediaType: 'image/jpeg' }] },
      erasable: { text: 'Both boats', spans: [{ start: 0, end: 10, source: 'typed' }] },
      attachments: [new Uint8Array([1, 2]), new Uint8Array([3, 4])],
    },
  ]);

  invariant(photo);

  await ctx.memory.writes.remember({
    text: 'Owns a red kayak',
    image: { messageSequence: photo.sequence, image: 2 },
    caller: {
      origin: 'conversation',
      thread: 'conversation',
      taskID: 'conversation',
      runID: 'conversation',
      model: 'test-model',
    },
  });

  const [pending] = await ctx.memory.proposals.listPending();

  invariant(pending);

  await ctx.memory.proposals.approve({
    proposalID: pending.proposalID,
    actionHash: pending.actionHash,
    identityID: 'identity-1',
  });

  const detail = await buildTestClient(ctx.url, laptop.token).memory.readItem({
    itemID: pending.itemID,
  });

  expect(detail.versions.map((version) => version.image)).toStrictEqual([
    { thread: 'conversation', sequence: photo.sequence, position: 1 },
  ]);
});

test('#memory.readItem refuses an item that does not exist', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const read = buildTestClient(ctx.url, laptop.token).memory.readItem({ itemID: 'no-such-item' });

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ code: 'MEMORY_ITEM_NOT_FOUND' });
});

test('#memory.findItems refuses a search before the memory store starts', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const read = buildTestClient(api.url, laptop.token).memory.findItems({ query: 'cello' });

  await read.catch(() => {});

  expect(read).rejects.toMatchObject({ code: 'MEMORY_NOT_STARTED' });
});
