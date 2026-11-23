import { expect, test } from 'bun:test';
import { seedSessionOpened } from '../test-utils/seed-session-opened';
import { seedTurnEnded } from '../test-utils/seed-turn-ended';
import { startTestTasks } from '../test-utils/start-test-tasks';
import { readSessionStart } from './read-session-start';

async function setupTest() {
  const tasks = await startTestTasks();

  return { tasks };
}

test('it starts a session at the turn before its opening record, so the opening turn’s writes belong to it', async () => {
  const ctx = await setupTest();
  const previousEnded = await seedTurnEnded(ctx.tasks.context);

  await seedSessionOpened(ctx.tasks.context);

  const start = await readSessionStart(ctx.tasks.context, 'conversation');

  expect(start).toBe(previousEnded.sequence);
});

test('it keeps the start when later turns end after the opening record', async () => {
  const ctx = await setupTest();
  const previousEnded = await seedTurnEnded(ctx.tasks.context);

  await seedSessionOpened(ctx.tasks.context);
  await seedTurnEnded(ctx.tasks.context);
  await seedTurnEnded(ctx.tasks.context);

  const start = await readSessionStart(ctx.tasks.context, 'conversation');

  expect(start).toBe(previousEnded.sequence);
});

test('it starts at 0 with no reset record, and with no turn ended before the reset', async () => {
  const ctx = await setupTest();
  const none = await readSessionStart(ctx.tasks.context, 'conversation');

  await seedSessionOpened(ctx.tasks.context);

  const afterReset = await readSessionStart(ctx.tasks.context, 'conversation');

  expect([none, afterReset]).toStrictEqual([0, 0]);
});
