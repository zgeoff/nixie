import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { createSystemTask, tasksProjections } from '@heynixie/tasks';
import { buildTestClock } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { createConsolidationDiff } from './test-utils/create-consolidation-diff';
import { createMemoryItem } from './test-utils/create-memory-item';
import { startTestMemory } from './test-utils/start-test-memory';

// a test memory on a test clock, and a tasks context over its log that can create the
// consolidator's task
async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-10-12T09:00:00Z'));
  const memory = await startTestMemory({ gate: { clock } });
  const log = { ...memory.log, projections: [...memory.log.projections, ...tasksProjections] };
  const tasks = { log, clock, definitions: () => ({ snapshotHash: 'sha256:test' }) };

  return { memory, clock, tasks };
}

test('it wakes the consolidator when you reject the last pending change', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' });

  await createSystemTask(ctx.tasks, 'memory-consolidator');

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'The trip ended.', source: 'owner' }],
    now: ctx.clock.now(),
  });
  const [change] = diff.changes;

  invariant(change);

  await ctx.memory.store.consolidations.reject({
    changeID: change.changeID,
    actionHash: change.actionHash,
    identityID: 'device-1',
  });

  const records = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    thread: 'memory-consolidator',
  });

  expect(records.map((entry) => entry.record.kind)).toStrictEqual([
    'task.created',
    'memory.consolidation_proposed',
    'memory.consolidation_rejected',
    'task.wake',
  ]);
});

test('it wakes the consolidator when you approve the last pending change', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' });

  await createSystemTask(ctx.tasks, 'memory-consolidator');

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'The trip ended.', source: 'owner' }],
    now: ctx.clock.now(),
  });
  const [change] = diff.changes;

  invariant(change);

  await ctx.memory.store.consolidations.approve({
    changeID: change.changeID,
    actionHash: change.actionHash,
    identityID: 'device-1',
  });

  const wakes = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    thread: 'memory-consolidator',
    kinds: ['task.wake'],
  });

  expect(wakes).toHaveLength(1);
});

test('it leaves the consolidator asleep while another change still pends', async () => {
  const ctx = await setupTest();
  const [stale, trip] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' }),
    createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' }),
  ]);

  await createSystemTask(ctx.tasks, 'memory-consolidator');

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      { kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' },
      { kind: 'retire', inputs: [trip], reason: 'The trip ended.', source: 'owner' },
    ],
    now: ctx.clock.now(),
  });
  const [first] = diff.changes;

  invariant(first);

  await ctx.memory.store.consolidations.reject({
    changeID: first.changeID,
    actionHash: first.actionHash,
    identityID: 'device-1',
  });

  const wakes = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    thread: 'memory-consolidator',
    kinds: ['task.wake'],
  });

  expect(wakes).toStrictEqual([]);
});

test('it writes no wake when no consolidator task runs', async () => {
  const ctx = await setupTest();
  const item = await createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' });
  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [item], reason: 'The trip ended.', source: 'owner' }],
    now: ctx.clock.now(),
  });
  const [change] = diff.changes;

  invariant(change);

  await ctx.memory.store.consolidations.reject({
    changeID: change.changeID,
    actionHash: change.actionHash,
    identityID: 'device-1',
  });

  const wakes = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    thread: 'memory-consolidator',
    kinds: ['task.wake'],
  });

  expect(wakes).toStrictEqual([]);
});
