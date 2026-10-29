import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import { readWriterRow } from './read-writer-row';
import { runWriterBatch } from './run-writer-batch';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { claimWriterLease } from './test-utils/claim-writer-lease';
import { createStubWriterSession } from './test-utils/create-stub-writer-session';
import { startTestMemory } from './test-utils/start-test-memory';
import { writePlannedBatch } from './test-utils/write-planned-batch';
import { writerConfigSchema } from './writer-config-schema';

async function setupTest() {
  const memory = await startTestMemory();

  const clock = buildTestClock(1_000_000);
  const context = { log: memory.log, clock, definitions: () => ({ snapshotHash: 'sha256:test' }) };

  const parts = {
    context,
    store: memory.store,
    publish: memory.store.writeBatch,
    gate: memory.store.writes.batch,
    config: writerConfigSchema.parse({}),
    getPersona: () => '',
    getPrompts: () => ({}),
    ownerName: null,
    assistantName: null,
    defaultZone: 'UTC',
    messaging: { directory: [], hopLimit: 20, ownerName: null },
  };

  return { memory, clock, parts };
}

test('it merges a conversation write into the pending proposal the writer made of the same text, and tells the conversation it merged', async () => {
  const ctx = await setupTest();
  const lease = await claimWriterLease(ctx.parts.context);

  const input = {
    taskID: 'memory-writer',
    stepKey: 'step-1',
    lease,
    inbox: [],
    wake: { hop: 0, cause: { kind: 'event' as const } },
    sessionBoundary: null,
    signal: new AbortController().signal,
  };

  const planned = await writePlannedBatch(ctx.memory.log, ['I keep bees on the allotment.']);

  await runWriterBatch(
    {
      ...ctx.parts,
      ...createStubWriterSession({
        op: 'remember',
        subject: 'owner',
        text: 'The owner keeps bees.',
        quote: 'I keep bees',
        sourceSequence: planned.bounds.end,
        itemID: null,
      }),
    },
    { input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
  );

  const [proposed] = await ctx.memory.store.proposals.listPending();

  const outcome = await ctx.memory.store.writes.remember({
    text: 'the owner keeps bees',
    caller: buildMockWriteCaller({ model: 'claude-test-2' }),
  });

  const pending = await ctx.memory.store.proposals.listPending();

  expect(outcome).toMatchObject({
    status: 'proposed',
    proposalID: proposed?.proposalID,
    merged: true,
  });

  expect(pending).toMatchObject([
    {
      proposalID: proposed?.proposalID,
      text: 'The owner keeps bees.',
      origin: 'memory_writer',
      sources: [
        { origin: 'memory_writer', thread: 'memory-writer', model: 'claude-test-1' },
        { origin: 'conversation', thread: 'conversation', model: 'claude-test-2' },
      ],
    },
  ]);

  expect(pending).toHaveLength(1);
});

test('it merges a writer proposal into the pending proposal the conversation made of the same text', async () => {
  const ctx = await setupTest();
  const lease = await claimWriterLease(ctx.parts.context);

  const input = {
    taskID: 'memory-writer',
    stepKey: 'step-1',
    lease,
    inbox: [],
    wake: { hop: 0, cause: { kind: 'event' as const } },
    sessionBoundary: null,
    signal: new AbortController().signal,
  };

  const first = await ctx.memory.store.writes.remember({
    text: 'The owner keeps bees.',
    caller: buildMockWriteCaller({ model: 'claude-test-2' }),
  });

  const planned = await writePlannedBatch(ctx.memory.log, ['I keep bees on the allotment.']);

  const result = await runWriterBatch(
    {
      ...ctx.parts,
      ...createStubWriterSession({
        op: 'remember',
        subject: 'owner',
        text: 'The owner keeps bees.',
        quote: 'I keep bees',
        sourceSequence: planned.bounds.end,
        itemID: null,
      }),
    },
    { input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
  );

  const pending = await ctx.memory.store.proposals.listPending();

  expect(result).toMatchObject({ next: 'wait' });

  expect(pending).toMatchObject([
    {
      proposalID: 'proposalID' in first ? first.proposalID : null,
      sources: [{ origin: 'conversation' }, { origin: 'memory_writer', model: 'claude-test-1' }],
    },
  ]);

  expect(pending).toHaveLength(1);
});

test('it makes one proposal of 2 writes of the same text in one batch', async () => {
  const ctx = await setupTest();
  const lease = await claimWriterLease(ctx.parts.context);

  const input = {
    taskID: 'memory-writer',
    stepKey: 'step-1',
    lease,
    inbox: [],
    wake: { hop: 0, cause: { kind: 'event' as const } },
    sessionBoundary: null,
    signal: new AbortController().signal,
  };

  const planned = await writePlannedBatch(ctx.memory.log, ['I keep bees.', 'Yes, I keep bees.']);

  const session = createStubWriterSession({
    op: 'remember',
    subject: 'owner',
    text: 'The owner keeps bees.',
    quote: 'I keep bees',
    sourceSequence: planned.bounds.end,
    itemID: null,
  });

  session.model.runSession.mockImplementationOnce(() => {
    session.staging.stage({
      op: 'remember',
      subject: 'owner',
      text: 'The owner keeps bees',
      quote: 'I keep bees',
      sourceSequence: planned.sequences[0] ?? 0,
      itemID: null,
    });

    session.staging.stage({
      op: 'remember',
      subject: 'owner',
      text: 'The owner keeps bees.',
      quote: 'I keep bees',
      sourceSequence: planned.bounds.end,
      itemID: null,
    });

    return Promise.resolve({
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });

  await runWriterBatch(
    { ...ctx.parts, ...session },
    { input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
  );

  const pending = await ctx.memory.store.proposals.listPending();

  expect(pending).toMatchObject([
    {
      text: 'The owner keeps bees',
      sources: [{ origin: 'memory_writer' }, { origin: 'memory_writer' }],
    },
  ]);

  expect(pending).toHaveLength(1);
});

test('it keeps a sensitive write and a write with no mark of the same text as proposals of their own', async () => {
  const ctx = await setupTest();
  const lease = await claimWriterLease(ctx.parts.context);

  const input = {
    taskID: 'memory-writer',
    stepKey: 'step-1',
    lease,
    inbox: [],
    wake: { hop: 0, cause: { kind: 'event' as const } },
    sessionBoundary: null,
    signal: new AbortController().signal,
  };

  const planned = await writePlannedBatch(ctx.memory.log, [
    'I live at 12 Juniper Row.',
    'Yes, 12 Juniper Row.',
  ]);

  const session = createStubWriterSession({
    op: 'remember',
    subject: 'owner',
    text: 'The owner lives at 12 Juniper Row.',
    quote: 'I live at 12 Juniper Row',
    sourceSequence: planned.bounds.end,
    itemID: null,
  });

  session.model.runSession.mockImplementationOnce(() => {
    session.staging.stage({
      op: 'remember',
      subject: 'owner',
      text: 'The owner lives at 12 Juniper Row.',
      quote: 'I live at 12 Juniper Row',
      sourceSequence: planned.sequences[0] ?? 0,
      itemID: null,
      isSensitive: true,
    });

    session.staging.stage({
      op: 'remember',
      subject: 'owner',
      text: 'The owner lives at 12 Juniper Row.',
      quote: 'I live at 12 Juniper Row',
      sourceSequence: planned.sequences[0] ?? 0,
      itemID: null,
    });

    return Promise.resolve({
      inputTokens: 1,
      outputTokens: 1,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    });
  });

  await runWriterBatch(
    { ...ctx.parts, ...session },
    { input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
  );

  const pending = await ctx.memory.store.proposals.listPending();

  expect(pending.map((proposal) => proposal.isSensitive)).toStrictEqual([true, false]);
});
