import { expect, mock, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { readWriterRow } from './read-writer-row';
import { runWriterBatch } from './run-writer-batch';
import { buildMockCheckerAnswer } from './test-utils/build-mock-checker-answer';
import { claimWriterLease } from './test-utils/claim-writer-lease';
import { createStubWriterSession } from './test-utils/create-stub-writer-session';
import { registerFaultPointAction } from './test-utils/register-fault-point-action';
import type { TestMemoryOptions } from './test-utils/start-test-memory';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';
import { writePlannedBatch } from './test-utils/write-planned-batch';
import type { MemoryTables } from './types';
import { writerConfigSchema } from './writer-config-schema';

async function setupTest(options: TestMemoryOptions = {}) {
  const memory = await startTestMemory(options);

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
  };

  return { memory, clock, parts };
}

test('it publishes no proposal for an edit whose item moved on after the gate, and leaves the batch to run again', async () => {
  const ctx = await setupTest();
  const lease = await claimWriterLease(ctx.parts.context);

  const input = {
    taskID: 'memory-writer',
    stepKey: 'step-1',
    lease,
    inbox: [],
    sessionBoundary: null,
    signal: new AbortController().signal,
  };

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
      ...createStubWriterSession({
        op: 'remember',
        subject: 'owner',
        text: 'Lives on 9 Oak Lane',
        quote: '9 Oak Lane',
        sourceSequence: planned.bounds.end,
        itemID: item.itemID,
      }),
    },
    { input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
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
  const lease = await claimWriterLease(ctx.parts.context);

  const input = {
    taskID: 'memory-writer',
    stepKey: 'step-1',
    lease,
    inbox: [],
    sessionBoundary: null,
    signal: new AbortController().signal,
  };

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const planned = await writePlannedBatch(ctx.memory.log, ['I moved to 9 Oak Lane.']);

  const parts = {
    ...ctx.parts,
    ...createStubWriterSession({
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
    input,
    row: await readWriterRow(ctx.memory.log),
    now: ctx.clock.now(),
  });

  await runWriterBatch(parts, {
    input,
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
  const lease = await claimWriterLease(ctx.parts.context);

  const input = {
    taskID: 'memory-writer',
    stepKey: 'step-1',
    lease,
    inbox: [],
    sessionBoundary: null,
    signal: new AbortController().signal,
  };

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
      ...createStubWriterSession({
        op: 'remember',
        subject: 'owner',
        text: 'Lives on 9 Oak Lane',
        quote: '9 Oak Lane',
        sourceSequence: planned.bounds.end,
        itemID: item.itemID,
      }),
    },
    { input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
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

  const lease = await claimWriterLease(ctx.parts.context);

  const input = {
    taskID: 'memory-writer',
    stepKey: 'step-1',
    lease,
    inbox: [],
    sessionBoundary: null,
    signal: new AbortController().signal,
  };

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 0, at: 1_000_000 },
    },
  ]);

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
      ...createStubWriterSession({
        op: 'remember',
        subject: 'owner',
        text: 'Keeps bees on the roof',
        quote: 'I keep bees on the roof',
        sourceSequence: sequence,
        itemID: null,
      }),
    },
    { input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
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

test('it shows the checker the end time of a staged fact in your zone, and saves the fact with it', async () => {
  const check = mock(() => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })));

  const ctx = await setupTest({ gate: { check } });
  const lease = await claimWriterLease(ctx.parts.context);

  const input = {
    taskID: 'memory-writer',
    stepKey: 'step-1',
    lease,
    inbox: [],
    sessionBoundary: null,
    signal: new AbortController().signal,
  };

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 0, at: 1_000_000 },
    },
  ]);

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: "I'm in Lisbon until Friday.",
    spans: [{ start: 0, end: 27, source: 'typed' }],
    timeZone: 'Europe/London',
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
      ...createStubWriterSession({
        op: 'remember',
        subject: 'owner',
        text: 'Is in Lisbon until Friday',
        quote: "I'm in Lisbon until Friday",
        sourceSequence: sequence,
        itemID: null,
        until: Date.parse('2099-07-10T22:59:59Z'),
      }),
    },
    { input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
  );

  const recalled = await ctx.memory.store.recall({ query: 'Lisbon' });

  const [item] = recalled.items;

  invariant(item);

  const row = await ctx.memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select('until')
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(check).toHaveBeenCalledExactlyOnceWith({
    prompt: expect.toBeString(),
    input: expect.toEndWith(
      '<end_time>Fri 10 Jul 2099, 23:59, Europe/London (UTC+01:00)</end_time>',
    ),
  });

  expect(row.until).toBe(Date.parse('2099-07-10T22:59:59Z'));
});

test('it publishes an edit that clears the end time of an item and keeps its text', async () => {
  const ctx = await setupTest({
    gate: { check: () => Promise.resolve(buildMockCheckerAnswer({ verdict: 'asserted' })) },
  });

  const item = await ctx.memory.store.remember({
    text: 'Works from the Lisbon office',
    until: Date.parse('2099-10-25T23:59:59Z'),
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const lease = await claimWriterLease(ctx.parts.context);

  const input = {
    taskID: 'memory-writer',
    stepKey: 'step-1',
    lease,
    inbox: [],
    sessionBoundary: null,
    signal: new AbortController().signal,
  };

  await writeRecords(ctx.memory.log, [
    {
      kind: 'memory.writer_started',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'memory-writer',
      payload: { startSequence: 0, at: 1_000_000 },
    },
  ]);

  const sequence = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'I work from the Lisbon office for good now.',
    spans: [{ start: 0, end: 43, source: 'typed' }],
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
      ...createStubWriterSession({
        op: 'remember',
        subject: 'owner',
        text: 'Works from the Lisbon office',
        quote: 'I work from the Lisbon office for good now',
        sourceSequence: sequence,
        itemID: item.itemID,
        until: null,
      }),
    },
    { input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
  );

  const row = await ctx.memory.writer.db
    .$extendTables<MemoryTables>()
    .selectFrom('memory_items')
    .select(['until', 'version'])
    .where('item_id', '=', item.itemID)
    .executeTakeFirstOrThrow();

  expect(row).toStrictEqual({ until: null, version: 2 });
});

test('it publishes a flag as a record in the conversation, and creates no item or proposal', async () => {
  const ctx = await setupTest();
  const lease = await claimWriterLease(ctx.parts.context);

  const input = {
    taskID: 'memory-writer',
    stepKey: 'step-1',
    lease,
    inbox: [],
    sessionBoundary: null,
    signal: new AbortController().signal,
  };

  const planned = await writePlannedBatch(ctx.memory.log, ['You always pick the jazz station.']);

  await runWriterBatch(
    {
      ...ctx.parts,
      ...createStubWriterSession({
        op: 'flag',
        text: 'The assistant favours the jazz station.',
        sourceSequence: planned.bounds.end,
      }),
    },
    { input, row: await readWriterRow(ctx.memory.log), now: ctx.clock.now() },
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
