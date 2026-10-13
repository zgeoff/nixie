import { expect, test } from 'bun:test';
import { LeaseLostError, claimLease } from '@heynixie/tasks';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { createWriterStaging } from './create-writer-staging';
import { readWriterRow } from './read-writer-row';
import { startTestMemory } from './test-utils/start-test-memory';
import { writePlannedBatch } from './test-utils/write-planned-batch';
import { tryWriteBatch } from './try-write-batch';
import { writerConfigSchema } from './writer-config-schema';

// the writer's parts over a test memory, with the store's real publish, and the input of a writer
// step that holds the lease; the model and the gate never run, because a publish reaches neither
async function setupTest() {
  const memory = await startTestMemory();
  const clock = buildTestClock(1_000_000);
  const context = { log: memory.log, clock, definitions: () => ({ snapshotHash: 'sha256:test' }) };
  const lease = await claimLease(context, {
    kind: 'task',
    holder: 'runner-1',
    durationMs: 60_000,
    findCandidate: () => Promise.resolve('memory-writer'),
  });

  invariant(lease);

  const parts = {
    context,
    store: memory.store,
    publish: memory.store.writeBatch,
    staging: createWriterStaging(),
    model: {
      model: 'claude-test-1',
      profile: 'writer-direct',
      runSession: () => Promise.reject(new Error('no session runs in a publish')),
    },
    gate: {
      check: () => Promise.reject(new Error('no gate runs in a publish')),
      release: () => Promise.resolve(),
    },
    config: writerConfigSchema.parse({}),
    getPersona: () => '',
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

test('it publishes the batch and advances the cursor with its record', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['I live at 4 Elm Row.']);
  const row = await readWriterRow(ctx.memory.log);

  const result = await tryWriteBatch(ctx.parts, {
    input: ctx.input,
    row,
    now: ctx.clock.now(),
    bounds: planned.bounds,
    capped: { kind: 'publish', writes: [], dropped: 0 },
    usage: null,
  });
  const after = await readWriterRow(ctx.memory.log);

  expect(result).toStrictEqual({ status: 'published', applied: [], proposed: 0, forgotten: 0 });
  expect(after.cursor).toBe(planned.bounds.end);
});

test('it returns superseded when an item moved on since the session read it', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['I moved to 9 Oak Lane.']);
  const item = await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.store.retire({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const row = await readWriterRow(ctx.memory.log);
  const result = await tryWriteBatch(ctx.parts, {
    input: ctx.input,
    row,
    now: ctx.clock.now(),
    bounds: planned.bounds,
    capped: {
      kind: 'publish',
      writes: [
        {
          write: {
            op: 'remember',
            text: 'You live at 9 Oak Lane.',
            quote: '9 Oak Lane',
            sourceSequence: planned.bounds.end,
            target: item,
          },
          verdict: {
            outcome: 'apply',
            source: 'owner',
            checks: { quote: 'exact' },
            evidence: { recordSequence: planned.bounds.end, start: 12, end: 22 },
          },
        },
      ],
      dropped: 0,
    },
    usage: null,
  });

  expect(result).toStrictEqual({ status: 'superseded' });
});

test('it rejects a publish whose lease another claim replaced', async () => {
  const ctx = await setupTest();
  const planned = await writePlannedBatch(ctx.memory.log, ['I live at 4 Elm Row.']);
  const row = await readWriterRow(ctx.memory.log);

  const publish = tryWriteBatch(ctx.parts, {
    input: { ...ctx.input, lease: { ...ctx.input.lease, generation: 99 } },
    row,
    now: ctx.clock.now(),
    bounds: planned.bounds,
    capped: { kind: 'publish', writes: [], dropped: 0 },
    usage: null,
  });

  await publish.catch(() => {});

  expect(publish).rejects.toBeInstanceOf(LeaseLostError);
});
