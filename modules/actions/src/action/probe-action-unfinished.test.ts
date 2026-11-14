import { expect, test } from 'bun:test';
import { writeTaskControl } from '@heynixie/tasks';
import { buildActionSeeder } from '../test-utils/build-action-seeder';
import { createTestStep } from '../test-utils/create-test-step';
import { startTestActions } from '../test-utils/start-test-actions';
import { probeActionUnfinished } from './probe-action-unfinished';

async function setupTest() {
  const actions = await startTestActions();

  return { ...actions, seed: buildActionSeeder(actions) };
}

test('it finds a queued action that has not run unfinished', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const action = await ctx.seed.action({ step });
  const isUnfinished = await probeActionUnfinished(ctx.writer.db, action.queued_sequence);

  expect(isUnfinished).toBe(true);
});

test('it finds an action with an outcome finished', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const action = await ctx.seed.doneAction({ step });
  const isUnfinished = await probeActionUnfinished(ctx.writer.db, action.queued_sequence);

  expect(isUnfinished).toBe(false);
});

test('it finds an action that a stop cancelled finished', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const action = await ctx.seed.action({ step });

  await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'stop' });

  const isUnfinished = await probeActionUnfinished(ctx.writer.db, action.queued_sequence);

  expect(isUnfinished).toBe(false);
});

test('it finds no action for a sequence that no action queued as finished', async () => {
  const ctx = await setupTest();
  const isUnfinished = await probeActionUnfinished(ctx.writer.db, 9999);

  expect(isUnfinished).toBe(false);
});
