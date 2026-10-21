import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { removeMessageKey } from './test-utils/remove-message-key';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

async function setupTest() {
  return { memory: await startTestMemory() };
}

test("it reads a version's provenance with the writer's and the checker's models", async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Plays the cello on Thursdays',
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: 'memory-writer',
      proposalID: null,
      checks: {
        quote: 'pass',
        tokens: 'pass',
        checker: { verdict: 'asserted', model: 'checker-model-1', failure: null },
      },
      model: 'writer-model-1',
    },
  });

  const detail = await ctx.memory.store.view.readItem(item.itemID);

  expect(detail?.versions).toStrictEqual([
    {
      version: 1,
      change: 'created',
      state: 'active',
      origin: 'memory_writer',
      source: 'owner',
      recordedAt: expect.toBeNumber(),
      taskID: 'memory-writer',
      proposalID: null,
      checks: {
        quote: 'pass',
        tokens: 'pass',
        checker: { verdict: 'asserted', model: 'checker-model-1', failure: null },
      },
      writerModel: 'writer-model-1',
      checkerModel: 'checker-model-1',
      evidenceQuote: null,
      evidence: null,
      status: 'readable',
      text: 'Plays the cello on Thursdays',
    },
  ]);
});

test("it reads a version's quote inside the message it came from", async () => {
  const ctx = await setupTest();

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'Quick one: my sister Ana lives in Porto now.',
    spans: [{ start: 0, end: 44, source: 'typed' }],
  });

  const item = await ctx.memory.store.remember({
    text: "The user's sister Ana lives in Porto",
    evidenceQuote: 'my sister Ana lives in Porto',
    evidence: { recordSequence: sequence, start: 11, end: 39 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const detail = await ctx.memory.store.view.readItem(item.itemID);

  expect(detail?.versions[0]).toMatchObject({
    evidenceQuote: 'my sister Ana lives in Porto',
    evidence: {
      recordSequence: sequence,
      start: 11,
      end: 39,
      message: { status: 'readable', text: 'Quick one: my sister Ana lives in Porto now.' },
    },
  });
});

test('it reads the item with its current text beside its versions', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const detail = await ctx.memory.store.view.readItem(item.itemID);

  expect(detail).toMatchObject({
    itemID: item.itemID,
    state: 'active',
    version: 1,
    status: 'readable',
    text: 'Plays the cello on Thursdays',
    forgottenAt: null,
  });
});

test('it reads every version of an edited item, oldest first', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Plays the cello on Thursdays',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.remember({
    text: 'Plays the cello on Fridays',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const detail = await ctx.memory.store.view.readItem(item.itemID);

  expect(detail?.versions).toMatchObject([
    { version: 1, change: 'created', text: 'Plays the cello on Thursdays', evidence: null },
    { version: 2, change: 'edited', text: 'Plays the cello on Fridays', evidence: null },
  ]);
});

test('it reads the message of a forgotten message as shredded', async () => {
  const ctx = await setupTest();

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'My sister Ana lives in Porto.',
    spans: [{ start: 0, end: 29, source: 'typed' }],
  });

  const item = await ctx.memory.store.remember({
    text: "The user's sister Ana lives in Porto",
    evidenceQuote: 'My sister Ana lives in Porto',
    evidence: { recordSequence: sequence, start: 0, end: 28 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await removeMessageKey(ctx.memory.log, sequence);

  const detail = await ctx.memory.store.view.readItem(item.itemID);

  expect(detail?.versions[0]?.evidence).toStrictEqual({
    recordSequence: sequence,
    start: 0,
    end: 28,
    message: { status: 'shredded' },
  });
});

test('it reads a forgotten item as dated gaps that show no message', async () => {
  const ctx = await setupTest();

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I owe Robin twenty pounds.',
    spans: [{ start: 0, end: 26, source: 'typed' }],
  });

  const item = await ctx.memory.store.remember({
    text: 'Owes Robin twenty pounds',
    evidenceQuote: 'I owe Robin twenty pounds',
    evidence: { recordSequence: sequence, start: 0, end: 25 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const detail = await ctx.memory.store.view.readItem(item.itemID);

  expect(detail).toMatchObject({
    state: 'forgotten',
    status: 'shredded',
    forgottenAt: expect.toBeNumber(),
    versions: [
      {
        version: 1,
        recordedAt: expect.toBeNumber(),
        status: 'shredded',
        evidenceQuote: null,
        evidence: { recordSequence: sequence, start: 0, end: 25, message: null },
      },
    ],
  });
});

test('it reads no checker model for a version no checker saw', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Plays the cello on Thursdays',
    provenance: {
      origin: 'conversation',
      source: 'owner',
      taskID: 'conversation',
      proposalID: null,
      checks: { rule: 'remember-anything', tokens: 'pass' },
      model: 'conversation-model-1',
    },
  });

  const detail = await ctx.memory.store.view.readItem(item.itemID);

  expect(detail?.versions[0]).toMatchObject({
    writerModel: 'conversation-model-1',
    checkerModel: null,
  });
});

test("it reads the writer's model from the batch that applied a version whose row holds none", async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 0, at: 1_000_000 },
    },
  ]);

  const item = await ctx.memory.store.remember({
    text: 'Plays the cello on Thursdays',
    provenance: {
      origin: 'memory_writer',
      source: 'owner',
      taskID: 'memory-writer',
      proposalID: null,
      checks: {
        quote: 'pass',
        tokens: 'pass',
        checker: { verdict: 'asserted', model: 'checker-model-1', failure: null },
      },
      thread: 'memory-writer',
    },
  });

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.batch_published',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: {
        start: 0,
        end: 1,
        mode: 'catch_up',
        at: 1_000_000,
        applied: [{ itemID: item.itemID, version: 1 }],
        proposed: 0,
        dropped: 0,
        catchUpEnded: false,
        model: 'writer-model-1',
        profile: 'writer-direct',
        usage: { inputTokens: 100, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0 },
      },
    },
  ]);

  const detail = await ctx.memory.store.view.readItem(item.itemID);

  expect(detail?.versions[0]).toMatchObject({
    writerModel: 'writer-model-1',
    checkerModel: 'checker-model-1',
  });
});

test('it reads an item that does not exist as null', async () => {
  const ctx = await setupTest();
  const detail = await ctx.memory.store.view.readItem('no-such-item');

  expect(detail).toBeNull();
});
