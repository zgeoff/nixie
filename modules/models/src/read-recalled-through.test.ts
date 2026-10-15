import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { readRecalledThrough } from './read-recalled-through';
import { startTestTasks } from './test-utils/start-test-tasks';

async function setupTest() {
  return { tasks: await startTestTasks() };
}

test('it reads the sequence of the newest recall record in the thread', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:test' };

  const [, newest] = await writeRecords(ctx.tasks.context.log, [
    { kind: 'memory.recalled', definitions, thread: 'conversation', payload: { items: [] } },
    { kind: 'memory.recalled', definitions, thread: 'conversation', payload: { items: [] } },
    { kind: 'memory.recalled', definitions, thread: 'task-9', payload: { items: [] } },
  ]);

  invariant(newest);

  const through = await readRecalledThrough(ctx.tasks.context, 'conversation');

  expect(through).toBe(newest.sequence);
});

test('it reads 0 for a thread with no recall record', async () => {
  const ctx = await setupTest();

  const definitions = { snapshotHash: 'sha256:test' };

  await writeRecords(ctx.tasks.context.log, [
    { kind: 'memory.recalled', definitions, thread: 'task-9', payload: { items: [] } },
  ]);

  const through = await readRecalledThrough(ctx.tasks.context, 'conversation');

  expect(through).toBe(0);
});
