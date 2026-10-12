import { expect, mock, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { tasksProjections } from '@heynixie/tasks';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { createWriterStaging } from './create-writer-staging';
import { readWriterRow } from './read-writer-row';
import { startMemoryWriter } from './start-memory-writer';
import { startTestMemory } from './test-utils/start-test-memory';
import { writerConfigSchema } from './writer-config-schema';

// The writer's options over a test memory whose log also folds the tasks projections, because the
// writer's start creates its system task and wakes it through the task's inbox. The model and the
// gate never run, because no test runs a step.
async function setupTest() {
  const memory = await startTestMemory();
  const log = { ...memory.log, projections: [...memory.log.projections, ...tasksProjections] };
  const options = {
    context: {
      log,
      clock: buildTestClock(1_000_000),
      definitions: () => ({ snapshotHash: 'sha256:test' }),
    },
    store: memory.store,
    publish: memory.store.writeBatch,
    staging: createWriterStaging(),
    model: {
      model: 'claude-test-1',
      profile: 'writer-direct',
      runSession: () => Promise.reject(new Error('no session runs at start')),
    },
    gate: { check: () => Promise.reject(new Error('no gate runs at start')) },
    config: writerConfigSchema.parse({}),
    getPersona: () => '',
    onError: mock(),
  };

  return { memory, log, options };
}

test('it records the head of the log as where memory started', async () => {
  const ctx = await setupTest();
  const messages = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'I keep bees on the roof.' },
    },
  ]);

  const writer = await startMemoryWriter(ctx.options);

  ctx.memory.defer(() => writer.stop());

  const row = await readWriterRow(ctx.log);

  expect(row.start_sequence).toBe(messages[0]?.sequence ?? -1);
});

test('it records where memory started once across two starts', async () => {
  const ctx = await setupTest();

  const first = await startMemoryWriter(ctx.options);

  await first.stop();

  const second = await startMemoryWriter(ctx.options);

  ctx.memory.defer(() => second.stop());

  const entries = await readRecords(ctx.log, { afterSequence: 0, thread: 'memory-writer' });

  expect(entries.filter((entry) => entry.record.kind === 'memory.writer_started')).toHaveLength(1);
});

test('it wakes the writer at start with no message, so an earlier message counts as due', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'I keep bees on the roof.' },
    },
  ]);

  const writer = await startMemoryWriter(ctx.options);

  ctx.memory.defer(() => writer.stop());

  const entries = await readRecords(ctx.log, { afterSequence: 0, thread: 'memory-writer' });
  const wakes = entries.filter((entry) => entry.record.kind === 'task.wake');

  expect(wakes.map((entry) => entry.record.payload)).toStrictEqual([{ at: 1_000_000 }]);
});

test('it wakes the writer for each later message of yours and never for a reply', async () => {
  const ctx = await setupTest();
  const writer = await startMemoryWriter(ctx.options);

  ctx.memory.defer(() => writer.stop());

  const [first, , second] = await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'I keep bees on the roof.' },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'Noted.' },
    },
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'The hive is called Marigold.' },
    },
  ]);

  await waitForCondition(async () => {
    const entries = await readRecords(ctx.log, { afterSequence: second?.sequence ?? 0 });

    return entries.filter((entry) => entry.record.kind === 'task.wake').length >= 2;
  });

  const entries = await readRecords(ctx.log, { afterSequence: 0, thread: 'memory-writer' });
  const wakes = entries.filter((entry) => entry.record.kind === 'task.wake');

  invariant(first && second);
  expect(wakes.map((entry) => entry.record.payload['messageSequence'])).toStrictEqual([
    undefined,
    first.sequence,
    second.sequence,
  ]);
});
