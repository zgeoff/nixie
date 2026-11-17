import { expect, test } from 'bun:test';
import { removeThreadKeys } from '@heynixie/log';
import { writeTaskControl } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildActionSeeder } from '../test-utils/build-action-seeder';
import { createTestStep } from '../test-utils/create-test-step';
import { startTestActions } from '../test-utils/start-test-actions';
import { readApprovedCalls } from './read-approved-calls';

async function setupTest() {
  const actions = await startTestActions();

  return { context: actions.context, seed: buildActionSeeder({ context: actions.context }) };
}

test('it returns an empty map for no action IDs', async () => {
  const ctx = await setupTest();
  const calls = await readApprovedCalls(ctx.context, []);

  expect(calls).toStrictEqual(new Map());
});

test('it reads every state in one call', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const waiting = await ctx.seed.action({ step });
  const done = await ctx.seed.doneAction({ step: await createTestStep(ctx.context) });
  const failed = await ctx.seed.failedAction({ step: await createTestStep(ctx.context) });
  const unknown = await ctx.seed.unknownAction({ step: await createTestStep(ctx.context) });

  const calls = await readApprovedCalls(ctx.context, [
    waiting.action_id,
    done.action_id,
    failed.action_id,
    unknown.action_id,
  ]);

  expect(calls).toStrictEqual(
    new Map([
      [waiting.action_id, { state: 'waiting', reason: null }],
      [done.action_id, { state: 'applied', reason: null }],
      [failed.action_id, { state: 'failed', reason: 'no such recipient' }],
      [unknown.action_id, { state: 'unknown', reason: null }],
    ]),
  );
});

test('it reads an action that a stop cancelled as failed', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const action = await ctx.seed.action({ step });
  const stop = await writeTaskControl(ctx.context, { taskID: step.lease.workID, control: 'stop' });

  invariant(stop.status === 'controlled');

  const calls = await readApprovedCalls(ctx.context, [action.action_id]);

  expect(calls.get(action.action_id)).toStrictEqual({
    state: 'failed',
    reason: 'the task was stopped before it ran',
  });
});

test('it falls back to the sentence for the reason code after a forget', async () => {
  const ctx = await setupTest();
  const step = await createTestStep(ctx.context);
  const failed = await ctx.seed.failedAction({ step });

  await removeThreadKeys(ctx.context.log, failed.task_id);

  const calls = await readApprovedCalls(ctx.context, [failed.action_id]);

  expect(calls.get(failed.action_id)).toStrictEqual({
    state: 'failed',
    reason: 'the service refused it',
  });
});

test('it leaves out an ID with no action row', async () => {
  const ctx = await setupTest();
  const calls = await readApprovedCalls(ctx.context, ['missing']);

  expect(calls).toStrictEqual(new Map());
});
