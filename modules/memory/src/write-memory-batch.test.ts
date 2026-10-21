import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { LeaseLostError, claimLease } from '@heynixie/tasks';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { readWriterRow } from './read-writer-row';
import { removeMessageKey } from './test-utils/remove-message-key';
import { startFaultPointHold } from './test-utils/start-fault-point-hold';
import { startTestMemory } from './test-utils/start-test-memory';
import { writePlannedBatch } from './test-utils/write-planned-batch';

async function setupTest() {
  const memory = await startTestMemory();

  const clock = buildTestClock(1_000_000);

  const lease = await claimLease(
    { clock, log: memory.log },
    {
      kind: 'task',
      holder: 'runner-1',
      durationMs: 60_000,
      readCandidate: () => Promise.resolve('memory-writer'),
    },
  );

  invariant(lease);

  return { memory, clock, lease };
}

test('it publishes an applied write as a version the writer made', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['I live at 4 Elm Row.']);

  const result = await ctx.memory.store.writeBatch({
    lease: ctx.lease,
    clock: ctx.clock,
    bounds: planned.bounds,
    writes: [
      {
        write: {
          op: 'remember',
          subject: 'owner',
          text: 'You live at 4 Elm Row.',
          quote: '4 Elm Row',
          sourceSequence: planned.bounds.end,
          target: null,
        },
        verdict: {
          outcome: 'apply',
          source: 'owner',
          checks: { quote: 'exact' },
          evidence: { recordSequence: planned.bounds.end, start: 10, end: 19 },
          model: 'claude-writer-1',
        },
      },
    ],
    flags: [],
    buildRecords: () => [],
  });

  const recalled = await ctx.memory.store.recall({ query: 'Elm' });

  expect(result).toStrictEqual({
    status: 'published',
    applied: [{ itemID: expect.toBeString(), version: 1 }],
    proposed: 0,
    forgotten: 0,
    flags: [],
  });

  expect(recalled.items).toMatchObject([
    {
      text: 'You live at 4 Elm Row.',
      origin: 'memory_writer',
      source: 'owner',
      model: 'claude-writer-1',
    },
  ]);
});

test('it publishes every item the writer creates as a fact, never a self-note', async () => {
  const ctx = await setupTest();

  const planned = await writePlannedBatch(ctx.memory.log, [
    'I like it when you keep answers short.',
  ]);

  await ctx.memory.store.writeBatch({
    lease: ctx.lease,
    clock: ctx.clock,
    bounds: planned.bounds,
    writes: [
      {
        write: {
          op: 'remember',
          subject: 'owner',
          text: 'You like short answers.',
          quote: 'keep answers short',
          sourceSequence: planned.bounds.end,
          target: null,
        },
        verdict: {
          outcome: 'apply',
          source: 'owner',
          checks: { quote: 'exact' },
          evidence: { recordSequence: planned.bounds.end, start: 19, end: 37 },
          model: 'claude-writer-1',
        },
      },
    ],
    flags: [],
    buildRecords: () => [],
  });

  const recalled = await ctx.memory.store.recall({});

  expect(recalled.items).toMatchObject([{ text: 'You like short answers.', subject: 'owner' }]);
});

test('it publishes a proposal records and counts the proposal', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['I live at 4 Elm Row.']);

  const result = await ctx.memory.store.writeBatch({
    lease: ctx.lease,
    clock: ctx.clock,
    bounds: planned.bounds,
    writes: [
      {
        write: {
          op: 'remember',
          subject: 'owner',
          text: 'You live at 9 Oak Lane.',
          quote: '9 Oak Lane',
          sourceSequence: planned.bounds.end,
          target: null,
        },
        verdict: {
          outcome: 'propose',
          reason: 'the quote is not in its source',
          records: [
            {
              kind: 'test.proposal',
              definitions: { snapshotHash: 'sha256:test' },
              thread: 'memory-writer',
              payload: { sourceSequence: planned.bounds.end },
            },
          ],
          plan: null,
        },
      },
    ],
    flags: [],
    buildRecords: () => [],
  });

  const entries = await readRecords(ctx.memory.log, { afterSequence: 0, thread: 'memory-writer' });

  expect(result).toStrictEqual({
    status: 'published',
    applied: [],
    proposed: 1,
    forgotten: 0,
    flags: [],
  });

  expect(entries.map((entry) => entry.record.kind)).toContain('test.proposal');
});

test('it rejects a batch whose proposal names an item that moved on since the session read it', async () => {
  const ctx = await setupTest();

  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const planned = await writePlannedBatch(ctx.memory.log, ['I moved to 9 Oak Lane.']);

  await ctx.memory.store.remember({
    text: 'Lives on Pine Road',
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const publish = ctx.memory.store.writeBatch({
    lease: ctx.lease,
    clock: ctx.clock,
    bounds: planned.bounds,
    writes: [
      {
        write: {
          op: 'remember',
          subject: 'owner',
          text: 'You live at 9 Oak Lane.',
          quote: '9 Oak Lane',
          sourceSequence: planned.bounds.end,
          target: item,
        },
        verdict: {
          outcome: 'propose',
          reason: 'the checker did not assert the quote',
          records: [
            {
              kind: 'test.proposal',
              definitions: { snapshotHash: 'sha256:test' },
              thread: 'memory-writer',
              payload: { sourceSequence: planned.bounds.end },
            },
          ],
          plan: null,
        },
      },
    ],
    flags: [],
    buildRecords: () => [],
  });

  expect(publish).rejects.toMatchObject({ code: 'STALE_VERSION' });
});

test('it advances the cursor with the batch own records in the same publish', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['I live at 4 Elm Row.']);

  await ctx.memory.store.writeBatch({
    lease: ctx.lease,
    clock: ctx.clock,
    bounds: planned.bounds,
    writes: [],
    flags: [],
    buildRecords: (outcome) => [
      {
        kind: 'memory.batch_published',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'memory-writer',
        payload: {
          ...planned.bounds,
          mode: 'live',
          at: 1_000_000,
          applied: [],
          proposed: outcome.proposed,
          dropped: outcome.forgotten,
          catchUpEnded: false,
          model: null,
          profile: null,
          usage: null,
        },
      },
    ],
  });

  const row = await readWriterRow(ctx.memory.log);

  expect(row).toMatchObject({ cursor: planned.bounds.end, pending_start: null, batches: 1 });
});

test('it leaves out a write whose source was forgotten and counts it', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['My sister is called Robin.']);

  await removeMessageKey(ctx.memory.log, planned.bounds.end);

  const result = await ctx.memory.store.writeBatch({
    lease: ctx.lease,
    clock: ctx.clock,
    bounds: planned.bounds,
    writes: [
      {
        write: {
          op: 'remember',
          subject: 'owner',
          text: 'Your sister is called Robin.',
          quote: 'My sister is called Robin',
          sourceSequence: planned.bounds.end,
          target: null,
        },
        verdict: {
          outcome: 'apply',
          source: 'owner',
          checks: { quote: 'exact' },
          evidence: { recordSequence: planned.bounds.end, start: 0, end: 25 },
          model: 'claude-writer-1',
        },
      },
    ],
    flags: [],
    buildRecords: () => [],
  });

  const recalled = await ctx.memory.store.recall({ limit: 10 });

  expect(result).toStrictEqual({
    status: 'published',
    applied: [],
    proposed: 0,
    forgotten: 1,
    flags: [],
  });

  expect(recalled.items).toStrictEqual([]);
});

test('it keeps a flag whose source is readable, and leaves out one whose source was forgotten', async () => {
  const ctx = await setupTest();

  const planned = await writePlannedBatch(ctx.memory.log, [
    'You always pick the jazz station.',
    'You hum when you think, it is sweet.',
  ]);

  const [first, second] = planned.sequences;

  invariant(first !== undefined && second !== undefined);

  await removeMessageKey(ctx.memory.log, second);

  const result = await ctx.memory.store.writeBatch({
    lease: ctx.lease,
    clock: ctx.clock,
    bounds: planned.bounds,
    writes: [],
    flags: [
      { text: 'The assistant favours the jazz station.', sourceSequence: first },
      { text: 'The assistant hums while it thinks.', sourceSequence: second },
    ],
    buildRecords: () => [],
  });

  expect(result).toStrictEqual({
    status: 'published',
    applied: [],
    proposed: 0,
    forgotten: 0,
    flags: [{ text: 'The assistant favours the jazz station.', sourceSequence: first }],
  });
});

test('it applies a shared write as a shared item', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['Our deal: a riddle every Monday.']);

  await ctx.memory.store.writeBatch({
    lease: ctx.lease,
    clock: ctx.clock,
    bounds: planned.bounds,
    writes: [
      {
        write: {
          op: 'remember',
          subject: 'shared',
          text: 'The owner and the assistant swap a riddle every Monday.',
          quote: 'a riddle every Monday',
          sourceSequence: planned.bounds.end,
          target: null,
        },
        verdict: {
          outcome: 'apply',
          source: 'owner',
          checks: { quote: 'exact' },
          evidence: { recordSequence: planned.bounds.end, start: 10, end: 31 },
          model: 'claude-writer-1',
        },
      },
    ],
    flags: [],
    buildRecords: () => [],
  });

  const recalled = await ctx.memory.store.recall({ limit: 10 });

  expect(recalled.items).toMatchObject([
    {
      subject: 'shared',
      text: 'The owner and the assistant swap a riddle every Monday.',
    },
  ]);
});

test('it returns superseded for a batch the cursor no longer waits on', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['I live at 4 Elm Row.']);

  const result = await ctx.memory.store.writeBatch({
    lease: ctx.lease,
    clock: ctx.clock,
    bounds: { start: 0, end: planned.bounds.end + 1 },
    writes: [
      {
        write: {
          op: 'remember',
          subject: 'owner',
          text: 'You live at 4 Elm Row.',
          quote: '4 Elm Row',
          sourceSequence: planned.bounds.end,
          target: null,
        },
        verdict: {
          outcome: 'apply',
          source: 'owner',
          checks: { quote: 'exact' },
          evidence: { recordSequence: planned.bounds.end, start: 10, end: 19 },
          model: 'claude-writer-1',
        },
      },
    ],
    flags: [],
    buildRecords: () => [],
  });

  const recalled = await ctx.memory.store.recall({ limit: 10 });

  expect(result).toStrictEqual({ status: 'superseded' });
  expect(recalled.items).toStrictEqual([]);
});

test('it rejects a publish under a lease another claim replaced', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['I live at 4 Elm Row.']);

  const publish = ctx.memory.store.writeBatch({
    lease: { ...ctx.lease, generation: ctx.lease.generation + 1 },
    clock: ctx.clock,
    bounds: planned.bounds,
    writes: [],
    flags: [],
    buildRecords: () => [],
  });

  await publish.catch(() => {});

  expect(publish).rejects.toBeInstanceOf(LeaseLostError);
});

test('it rejects a publish after the lease expired', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['I live at 4 Elm Row.']);

  ctx.clock.advance(ctx.lease.expiresAt - ctx.clock.now());

  const publish = ctx.memory.store.writeBatch({
    lease: ctx.lease,
    clock: ctx.clock,
    bounds: planned.bounds,
    writes: [],
    flags: [],
    buildRecords: () => [],
  });

  await publish.catch(() => {});

  expect(publish).rejects.toBeInstanceOf(LeaseLostError);
});

test('it rejects a publish whose lease expired while it waited for the delivery lock', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['I live at 4 Elm Row.']);

  const hold = startFaultPointHold('memory.recall.checked');
  const recall = ctx.memory.store.recall({ limit: 10 });

  await hold.reached;

  const publish = ctx.memory.store.writeBatch({
    lease: ctx.lease,
    clock: ctx.clock,
    bounds: planned.bounds,
    writes: [],
    flags: [],
    buildRecords: (outcome) => [
      {
        kind: 'memory.batch_published',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'memory-writer',
        payload: {
          ...planned.bounds,
          mode: 'live',
          at: 1_000_000,
          applied: [],
          proposed: outcome.proposed,
          dropped: outcome.forgotten,
          catchUpEnded: false,
          model: null,
          profile: null,
          usage: null,
        },
      },
    ],
  });

  ctx.clock.advance(ctx.lease.expiresAt - ctx.clock.now());
  hold.release();

  const [, published] = await Promise.allSettled([recall, publish]);

  expect({ published, row: await readWriterRow(ctx.memory.log) }).toMatchObject({
    published: { status: 'rejected', reason: { name: 'LeaseLostError' } },
    row: { cursor: 0, pending_start: 0, pending_end: planned.bounds.end, batches: 0 },
  });
});

test('it leaves out a write whose message backed an item forgotten after the gate ran', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['I live at 4 Elm Row.']);

  const item = await ctx.memory.store.remember({
    text: 'Lives at 4 Elm Row',
    evidenceQuote: '4 Elm Row',
    evidence: { recordSequence: planned.bounds.end, start: 10, end: 19 },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const result = await ctx.memory.store.writeBatch({
    lease: ctx.lease,
    clock: ctx.clock,
    bounds: planned.bounds,
    writes: [
      {
        write: {
          op: 'remember',
          subject: 'owner',
          text: 'You live at 4 Elm Row.',
          quote: '4 Elm Row',
          sourceSequence: planned.bounds.end,
          target: null,
        },
        verdict: {
          outcome: 'apply',
          source: 'owner',
          checks: { quote: 'exact' },
          evidence: { recordSequence: planned.bounds.end, start: 10, end: 19 },
          model: 'claude-writer-1',
        },
      },
    ],
    flags: [],
    buildRecords: () => [],
  });

  expect(result).toStrictEqual({
    status: 'published',
    applied: [],
    proposed: 0,
    forgotten: 1,
    flags: [],
  });
});
