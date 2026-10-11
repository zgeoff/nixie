import { expect, test } from 'bun:test';
import { runProjectionRebuild } from '@heynixie/log';
import { createTask } from '@heynixie/tasks';
import { claimAction } from './claim-action';
import { createAllowedAction } from './create-allowed-action';
import { runActionAttempt } from './run-action-attempt';
import { buildStubConnector } from './test-utils/build-stub-connector';
import { startTestActions } from './test-utils/start-test-actions';
import type { ActionsTables } from './types';

// 2 actions: one that a refusal returned to pending for a retry, and one that settled as done
async function setupTest() {
  const actions = await startTestActions();
  const taskID = await createTask(actions.context, 'send the weekly summary');
  const stub = buildStubConnector((call) =>
    call.arguments['to'] === 'team'
      ? { kind: 'refused_retryable', reason: 'rate limited' }
      : { kind: 'success', result: { messageID: 'm-1' } },
  );

  for (const to of ['team', 'owner']) {
    // oxlint-disable-next-line no-await-in-loop -- each action queues, then runs one attempt
    await createAllowedAction(actions.context, {
      taskID,
      stepKey: `${taskID}:1`,
      tool: 'test.send',
      actionHash: `sha256:${to}`,
      arguments: { to },
      decision: { outcome: 'allow', stage: 4, rule: { id: 'test-rule', revision: 1 } },
    });

    // oxlint-disable-next-line no-await-in-loop -- each action queues, then runs one attempt
    const lease = await claimAction(actions.context, { holder: 'runner-a', leaseMs: 60_000 });

    if (lease !== null) {
      // oxlint-disable-next-line no-await-in-loop -- each action queues, then runs one attempt
      await runActionAttempt(actions.context, lease, {
        connectors: new Map([['test.send', stub.connector]]),
        leaseMs: 60_000,
      });
    }
  }
  return { ...actions, db: actions.writer.db.$extendTables<ActionsTables>() };
}

test('it rebuilds the actions table equal to the live one', async () => {
  const ctx = await setupTest();

  const live = await ctx.db.selectFrom('actions').selectAll().orderBy('action_id').execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db.selectFrom('actions').selectAll().orderBy('action_id').execute();

  expect(rebuilt).toStrictEqual(live);
  expect(live.map((action) => action.status).toSorted()).toStrictEqual(['done', 'pending']);
});
