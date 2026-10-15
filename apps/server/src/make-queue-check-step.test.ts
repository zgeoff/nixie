import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import type { ActionsTables } from '@heynixie/actions';
import { actionsProjection, claimAction, runActionAttempt } from '@heynixie/actions';
import type { Writer } from '@heynixie/log';
import { logProjections, readRecords, startWriter } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import { tasksProjections, writeInboxRecords } from '@heynixie/tasks';
import { buildTestClock } from '@heynixie/testing';
import { buildActions } from './build-actions';
import { makeQueueCheckStep } from './make-queue-check-step';
import { createTestStep } from './test-utils/create-test-step';

// a writer with the tasks and actions projections on a test clock, a claimed step, the queue
// check's step behind the action queue's step tracking, a wake for the step's task, and one attempt
// of the action an action runner would claim next
async function setupTest() {
  const stack = new AsyncDisposableStack();

  onTestFinished(() => stack.disposeAsync());

  const dataDir = await mkdtemp(`${tmpdir()}/nixie-queue-check-`);

  stack.defer(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  stack.defer(() => writer.stop());

  const context = await buildActionsContext(writer);
  const step = await createTestStep(context);

  const actions = buildActions(context, () => {});

  return {
    context,
    db: writer.db.$extendTables<ActionsTables>(),
    step,
    runStep: actions.trackSteps(
      makeQueueCheckStep({ context, queue: actions.queue, tool: actions.logConnector.tool }),
    ),
    wake: () =>
      writeInboxRecords(context, [
        {
          kind: 'task.wake',
          definitions: context.definitions(),
          thread: step.taskID,
          payload: { at: 1_000_000 },
        },
      ]),
    runNextAttempt: async () => {
      const lease = await claimAction(context, { holder: 'action-runner', leaseMs: 60_000 });

      if (lease === null) {
        throw new Error('no queued action was claimable');
      }

      await runActionAttempt(context, lease, { connectors: actions.connectors, leaseMs: 60_000 });
    },
  };
}

async function buildActionsContext(writer: Writer): Promise<TasksContext> {
  return {
    log: {
      writer,
      deploymentKey: await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
        'wrapKey',
        'unwrapKey',
      ]),
      projections: [...logProjections, ...tasksProjections, actionsProjection],
    },
    clock: buildTestClock(1_000_000),
    definitions: () => ({ snapshotHash: 'sha256:test' }),
  };
}

test('it queues one actions.log action under the step that a wake starts, allowed by slice1.queue-check', async () => {
  const ctx = await setupTest();
  const inbox = await ctx.wake();
  const result = await ctx.runStep({ ...ctx.step, inbox });
  const actions = await ctx.db.selectFrom('actions').selectAll().execute();

  const called = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['tool_called', 'tool_result'],
  });

  expect(actions).toMatchObject([
    {
      task_id: ctx.step.taskID,
      step_key: ctx.step.stepKey,
      tool: 'actions.log',
      status: 'pending',
    },
  ]);

  expect(called.map((read) => [read.record.kind, read.record.decision])).toStrictEqual([
    [
      'tool_called',
      { outcome: 'allow', stage: 3, rule: { id: 'slice1.queue-check', revision: 1 } },
    ],
    ['tool_result', null],
  ]);

  expect(result).toStrictEqual({
    next: 'wait',
    records: [],
    acknowledged: inbox.map((record) => record.sequence),
  });
});

test('it queues nothing more for the outcome of the action it queued, and reads that outcome', async () => {
  const ctx = await setupTest();

  await ctx.runStep({ ...ctx.step, inbox: await ctx.wake() });
  await ctx.runNextAttempt();

  const outcome = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['action.outcome'],
  });

  const inbox = outcome.map((read) => read.record);

  const result = await ctx.runStep({ ...ctx.step, inbox });
  const actions = await ctx.db.selectFrom('actions').select('status').execute();

  expect(actions).toStrictEqual([{ status: 'done' }]);
  expect(result.acknowledged).toStrictEqual(inbox.map((record) => record.sequence));
});
