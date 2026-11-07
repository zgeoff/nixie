import { expect, test } from 'bun:test';
import { createConversationTask, writeInboxRecords } from '@heynixie/tasks';
import { runClaimedTestStep } from './run-claimed-test-step';
import { startTestServer } from './start-test-server';

async function setupTest() {
  const server = await startTestServer();

  return {
    server,
    writeMessage: (text: string) =>
      writeInboxRecords(server.context, [
        {
          kind: 'owner_message',
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'conversation',
          erasable: { text },
        },
      ]),
  };
}

test('it runs the claimable conversation step and returns null once the step commits', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.server.context);

  await ctx.writeMessage('Is the gate locked?');

  const errored = await runClaimedTestStep(ctx.server.context, () =>
    Promise.resolve({ next: 'wait', records: [], acknowledged: [] }),
  );

  expect(errored).toBeNull();
});

test('it returns the step error of a step that throws', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.server.context);

  await ctx.writeMessage('Is the gate locked?');

  const failure = new Error('the guest dropped its socket');

  const errored = await runClaimedTestStep(ctx.server.context, () => Promise.reject(failure));

  expect(errored).toStrictEqual({
    taskID: 'conversation',
    stepKey: expect.any(String),
    errors: 1,
    errorLimit: 1,
    nextState: 'ready',
    retryAt: expect.any(Number),
    error: failure,
  });
});

test('it throws when no task is claimable', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.server.context);

  const run = runClaimedTestStep(ctx.server.context, () =>
    Promise.resolve({ next: 'wait', records: [], acknowledged: [] }),
  );

  await run.catch(() => {});

  expect(run).rejects.toThrowWithMessage(Error, 'the conversation had no work to claim');
});
