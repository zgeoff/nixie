import { expect, test } from 'bun:test';
import { buildTestClock } from '@heynixie/testing';
import { readWriterRow } from './read-writer-row';
import { runWriterBatch } from './run-writer-batch';
import { buildMockWriteCaller } from './test-utils/build-mock-write-caller';
import { buildStubWriterSession } from './test-utils/build-stub-writer-session';
import { claimWriterLease } from './test-utils/claim-writer-lease';
import { startTestMemory } from './test-utils/start-test-memory';
import { writePlannedBatch } from './test-utils/write-planned-batch';
import { writerConfigSchema } from './writer-config-schema';

// The writer's parts over a test memory, with the store's real batch gate and publish, and the
// input of a step that holds the lease. The checker answers that it failed, so each write the gate
// reaches waits for review as a proposal from the memory writer.
async function setupTest() {
  const memory = await startTestMemory();

  const clock = buildTestClock(1_000_000);
  const context = { log: memory.log, clock, definitions: () => ({ snapshotHash: 'sha256:test' }) };

  const lease = await claimWriterLease(context);

  const parts = {
    context,
    store: memory.store,
    publish: memory.store.writeBatch,
    gate: memory.store.writes.batch,
    config: writerConfigSchema.parse({}),
    getPersona: () => '',
    ownerName: null,
    assistantName: null,
  };

  const input = {
    taskID: 'memory-writer',
    stepKey: 'step-1',
    lease,
    inbox: [],
    sessionBoundary: null,
    signal: new AbortController().signal,
  };

  return { memory, clock, parts, input };
}

test('it merges a conversation write into the pending proposal the writer made of the same text, and tells the conversation it merged', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['I keep bees on the allotment.']);

  await runWriterBatch(
    {
      ...ctx.parts,
      ...buildStubWriterSession({
        op: 'remember',
        subject: 'owner',
        text: 'The owner keeps bees.',
        quote: 'I keep bees',
        sourceSequence: planned.bounds.end,
        itemID: null,
      }),
    },
    { input: ctx.input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
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

  const first = await ctx.memory.store.writes.remember({
    text: 'The owner keeps bees.',
    caller: buildMockWriteCaller({ model: 'claude-test-2' }),
  });

  const planned = await writePlannedBatch(ctx.memory.log, ['I keep bees on the allotment.']);

  const result = await runWriterBatch(
    {
      ...ctx.parts,
      ...buildStubWriterSession({
        op: 'remember',
        subject: 'owner',
        text: 'The owner keeps bees.',
        quote: 'I keep bees',
        sourceSequence: planned.bounds.end,
        itemID: null,
      }),
    },
    { input: ctx.input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
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
  const planned = await writePlannedBatch(ctx.memory.log, ['I keep bees.', 'Yes, I keep bees.']);

  const session = buildStubWriterSession({
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
    { input: ctx.input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
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
