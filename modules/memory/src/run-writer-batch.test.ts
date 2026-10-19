import { expect, mock, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { readWriterRow } from './read-writer-row';
import { runWriterBatch } from './run-writer-batch';
import { buildMockCheckerAnswer } from './test-utils/build-mock-checker-answer';
import { buildStubWriterSession } from './test-utils/build-stub-writer-session';
import { claimWriterLease } from './test-utils/claim-writer-lease';
import { registerFaultPointAction } from './test-utils/register-fault-point-action';
import type { TestMemoryOptions } from './test-utils/start-test-memory';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';
import { writePlannedBatch } from './test-utils/write-planned-batch';
import { writerConfigSchema } from './writer-config-schema';

// The writer's parts over a test memory, with the store's real batch gate and publish, and the
// input of a step that holds the lease. The checker answers that it failed unless the config wires
// another, so each write the gate reaches waits for review. Each test supplies the session.
async function setupTest(options: TestMemoryOptions = {}) {
  const memory = await startTestMemory(options);

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

test('it publishes no proposal for an edit whose item moved on after the gate, and leaves the batch to run again', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const planned = await writePlannedBatch(ctx.memory.log, ['I moved to 9 Oak Lane.']);

  registerFaultPointAction('writer.batch.gated', () =>
    ctx.memory.store.remember({
      text: 'Lives on Pine Road',
      target: item,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    }),
  );

  const result = await runWriterBatch(
    {
      ...ctx.parts,
      ...buildStubWriterSession({
        op: 'remember',
        subject: 'owner',
        text: 'Lives on 9 Oak Lane',
        quote: '9 Oak Lane',
        sourceSequence: planned.bounds.end,
        itemID: item.itemID,
      }),
    },
    { input: ctx.input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
  );

  const [pending, after] = await Promise.all([
    ctx.memory.store.proposals.listPending(),
    readWriterRow(ctx.memory.log),
  ]);

  expect(result).toStrictEqual({ next: 'continue', timers: [] });
  expect(pending).toStrictEqual([]);
  expect(after.cursor).toBe(planned.bounds.start);
});

test('it extracts the batch again after a moved-on edit, and proposes the edit against the version now current', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const planned = await writePlannedBatch(ctx.memory.log, ['I moved to 9 Oak Lane.']);

  const parts = {
    ...ctx.parts,
    ...buildStubWriterSession({
      op: 'remember',
      subject: 'owner',
      text: 'Lives on 9 Oak Lane',
      quote: '9 Oak Lane',
      sourceSequence: planned.bounds.end,
      itemID: item.itemID,
    }),
  };

  registerFaultPointAction('writer.batch.gated', () =>
    ctx.memory.store.remember({
      text: 'Lives on Pine Road',
      target: item,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    }),
  );

  await runWriterBatch(parts, {
    input: ctx.input,
    row: await readWriterRow(ctx.memory.log),
    now: ctx.clock.now(),
  });

  await runWriterBatch(parts, {
    input: ctx.input,
    row: await readWriterRow(ctx.memory.log),
    now: ctx.clock.now(),
  });

  const pending = await ctx.memory.store.proposals.listPending();

  expect(parts.model.runSession).toHaveBeenCalledTimes(2);

  expect(pending).toMatchObject([
    { operation: 'remember', itemID: item.itemID, targetVersion: 2, text: 'Lives on 9 Oak Lane' },
  ]);
});

test('it never runs the checker on an edit whose item moved on during extraction, and leaves the batch to run again', async () => {
  const check = mock(() => Promise.reject(new Error('the checker must not run')));

  const ctx = await setupTest({ gate: { check } });

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const planned = await writePlannedBatch(ctx.memory.log, ['I moved to 9 Oak Lane.']);

  registerFaultPointAction('writer.batch.extracted', () =>
    ctx.memory.store.remember({
      text: 'Lives on Pine Road',
      target: item,
      provenance: {
        origin: 'owner',
        source: 'owner',
        taskID: null,
        proposalID: null,
        checks: null,
      },
    }),
  );

  const result = await runWriterBatch(
    {
      ...ctx.parts,
      ...buildStubWriterSession({
        op: 'remember',
        subject: 'owner',
        text: 'Lives on 9 Oak Lane',
        quote: '9 Oak Lane',
        sourceSequence: planned.bounds.end,
        itemID: item.itemID,
      }),
    },
    { input: ctx.input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
  );

  const pending = await ctx.memory.store.proposals.listPending();

  expect(result).toStrictEqual({ next: 'continue', timers: [] });
  expect(check).not.toHaveBeenCalled();
  expect(pending).toStrictEqual([]);
});

test("it applies a write the checker confirms with both the writer's and the checker's models", async () => {
  const ctx = await setupTest({
    gate: {
      check: () =>
        Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted', model: 'claude-checker-1' })),
    },
  });

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 0, at: 1_000_000 },
    },
  ]);

  // the quote check passes only on words you typed, so the message records its typed span
  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I keep bees on the roof.',
    spans: [{ start: 0, end: 24, source: 'typed' }],
  });

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.batch_planned',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { start: 0, end: sequence, mode: 'live', at: 1_000_000 },
    },
  ]);

  await runWriterBatch(
    {
      ...ctx.parts,
      ...buildStubWriterSession({
        op: 'remember',
        subject: 'owner',
        text: 'Keeps bees on the roof',
        quote: 'I keep bees on the roof',
        sourceSequence: sequence,
        itemID: null,
      }),
    },
    { input: ctx.input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
  );

  const recalled = await ctx.memory.store.recall({ query: 'bees' });

  const [item] = recalled.items;

  invariant(item);

  const detail = await ctx.memory.store.view.readItem(item.itemID);

  expect(detail?.versions).toMatchObject([
    {
      origin: 'memory_writer',
      source: 'owner',
      writerModel: 'claude-test-1',
      checkerModel: 'claude-checker-1',
    },
  ]);
});

test('it publishes a flag as a record in the conversation, and creates no item or proposal', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['You always pick the jazz station.']);

  await runWriterBatch(
    {
      ...ctx.parts,
      ...buildStubWriterSession({
        op: 'flag',
        text: 'The assistant favours the jazz station.',
        sourceSequence: planned.bounds.end,
      }),
    },
    { input: ctx.input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
  );

  const [flags, recalled, pending] = await Promise.all([
    readRecords(ctx.memory.log, { afterSequence: 0, kinds: ['memory.self_note_flagged'] }),
    ctx.memory.store.recall({ limit: 10 }),
    ctx.memory.store.proposals.listPending(),
  ]);

  expect(flags.map((entry) => entry.record)).toMatchObject([
    {
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: { sourceSequence: planned.bounds.end },
      erasable: {
        status: 'readable',
        fields: { text: 'The assistant favours the jazz station.' },
      },
    },
  ]);

  expect(recalled.items).toStrictEqual([]);
  expect(pending).toStrictEqual([]);
});
