import { expect, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readSessionStart } from './read-session-start';

async function setupTest() {
  const tasks = await startTestTasks();

  const writeKinds = async (kinds: readonly ('model.turn_ended' | 'model.session_opened')[]) => {
    const records = await writeRecords(
      tasks.context.log,
      kinds.map((kind) => ({
        kind,
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        payload: {},
      })),
    );

    return records.map((record) => record.sequence);
  };

  return { tasks, writeKinds };
}

test('it starts a session at the turn before its opening record, so the opening turn’s writes belong to it', async () => {
  const ctx = await setupTest();
  const [previousEnded] = await ctx.writeKinds(['model.turn_ended', 'model.session_opened']);

  invariant(previousEnded !== undefined);

  const start = await readSessionStart(ctx.tasks.context, 'conversation');

  expect(start).toBe(previousEnded);
});

test('it keeps the start when later turns end after the opening record', async () => {
  const ctx = await setupTest();

  const [previousEnded] = await ctx.writeKinds([
    'model.turn_ended',
    'model.session_opened',
    'model.turn_ended',
    'model.turn_ended',
  ]);

  invariant(previousEnded !== undefined);

  const start = await readSessionStart(ctx.tasks.context, 'conversation');

  expect(start).toBe(previousEnded);
});

test('it starts at 0 with no reset record, and with no turn ended before the reset', async () => {
  const ctx = await setupTest();
  const none = await readSessionStart(ctx.tasks.context, 'conversation');

  await ctx.writeKinds(['model.session_opened']);

  const afterReset = await readSessionStart(ctx.tasks.context, 'conversation');

  expect([none, afterReset]).toStrictEqual([0, 0]);
});
