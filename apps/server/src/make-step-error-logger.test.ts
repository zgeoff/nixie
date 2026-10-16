import { expect, mock, test } from 'bun:test';
import type { Logger } from '@heynixie/logger';
import { SandboxHostError } from '@heynixie/sandbox';
import { buildImpPort } from '@heynixie/sandbox-imp';
import { startStubImpd } from '@heynixie/sandbox-imp/test-utils';
import { createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { makeStepErrorLogger } from './make-step-error-logger';
import { sendTestMessage } from './test-utils/send-test-message';
import { startTestServer } from './test-utils/start-test-server';

// a fresh log and task store, with the conversation's task in it
async function setupTest() {
  const server = await startTestServer();

  await createConversationTask(server.context);

  return server;
}

test("it records and logs impd's code and message for a turn whose imp wake impd refuses", async () => {
  const ctx = await setupTest();

  const url = startStubImpd({
    code: 'RAM_BUDGET_EXCEEDED',
    status: 503,
    message: 'Not enough RAM budget, even after sleeping idle imps',
    data: { budgetMib: 8192, usedMib: 7680, requestedMib: 1024 },
  });

  const port = buildImpPort({ url, token: 'not-a-real-token' });
  const log = mock<Logger>();

  const errored = await sendTestMessage(
    ctx.context,
    async () => {
      await port.wakeImp('nixie-conversation');

      return { next: 'wait', records: [], acknowledged: [] };
    },
    'Is the ferry running on Sunday?',
  );

  invariant(errored);
  makeStepErrorLogger(log)(errored);

  const records = await ctx.readRecords();

  expect(records.filter((record) => record.kind === 'task.step_errored')).toMatchObject([
    {
      erasable: {
        status: 'readable',
        fields: {
          message:
            'the sandbox host failed the wake with RAM_BUDGET_EXCEEDED: Not enough RAM budget, even after sleeping idle imps',
        },
      },
    },
  ]);

  expect(log.mock.calls).toStrictEqual([
    [
      'task.step_errored',
      {
        taskID: 'conversation',
        stepKey: errored.stepKey,
        errors: 1,
        nextState: 'ready',
        retryAt: errored.retryAt,
        error: 'SandboxHostError',
        call: 'wake',
        code: 'RAM_BUDGET_EXCEEDED',
        hostMessage: 'Not enough RAM budget, even after sleeping idle imps',
      },
    ],
  ]);
});

test('it logs the call, the code and the host message of a sandbox host error', () => {
  const log = mock<Logger>();

  makeStepErrorLogger(log)({
    taskID: 'conversation',
    stepKey: 'conversation:6',
    errors: 1,
    errorLimit: 3,
    nextState: 'ready',
    retryAt: 1_030_000,
    error: new SandboxHostError({
      call: 'create',
      code: 'PRECONDITION_FAILED',
      hostMessage: 'Not possible on this host',
    }),
  });

  expect(log.mock.calls).toStrictEqual([
    [
      'task.step_errored',
      {
        taskID: 'conversation',
        stepKey: 'conversation:6',
        errors: 1,
        nextState: 'ready',
        retryAt: 1_030_000,
        error: 'SandboxHostError',
        call: 'create',
        code: 'PRECONDITION_FAILED',
        hostMessage: 'Not possible on this host',
      },
    ],
  ]);
});

test('it logs a step error with its task, step, count, next state and error name', () => {
  const log = mock<Logger>();

  makeStepErrorLogger(log)({
    taskID: 'conversation',
    stepKey: 'conversation:4',
    errors: 2,
    errorLimit: 3,
    nextState: 'ready',
    retryAt: 1_060_000,
    error: new RangeError('the guest exited before it ended its turn'),
  });

  expect(log.mock.calls).toStrictEqual([
    [
      'task.step_errored',
      {
        taskID: 'conversation',
        stepKey: 'conversation:4',
        errors: 2,
        nextState: 'ready',
        retryAt: 1_060_000,
        error: 'RangeError',
      },
    ],
  ]);
});

test('it logs the type of a thrown value that is not an error', () => {
  const log = mock<Logger>();

  makeStepErrorLogger(log)({
    taskID: 'task-1',
    stepKey: 'task-1:3',
    errors: 3,
    errorLimit: 3,
    nextState: 'failed',
    retryAt: 1_030_000,
    error: 'a thrown string',
  });

  expect(log.mock.calls).toStrictEqual([
    [
      'task.step_errored',
      {
        taskID: 'task-1',
        stepKey: 'task-1:3',
        errors: 3,
        nextState: 'failed',
        retryAt: 1_030_000,
        error: 'string',
      },
    ],
  ]);
});
