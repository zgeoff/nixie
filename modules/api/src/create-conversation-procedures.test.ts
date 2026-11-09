import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { claimTask, createConversationTask, runTaskStep } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

function setupTest() {
  return startTestAPI();
}

test('#conversation.retry makes the turn that failed claimable at once', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  await laptopClient.conversation.send({
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'What is on today?',
    spans: [],
  });

  const failed = await claimTask(ctx.context, { holder: 'step-runner', leaseMs: 60_000 });

  invariant(failed);

  await runTaskStep(ctx.context, failed, {
    runStep: () => Promise.reject(new Error('the provider is overloaded')),
    leaseMs: 60_000,
    logger: () => {},
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const retried = await laptopClient.conversation.retry({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
  });

  const next = await claimTask(ctx.context, { holder: 'step-runner', leaseMs: 60_000 });

  expect({ retried, taskID: next?.lease.workID }).toStrictEqual({
    retried: { retriedAt: new Date(1_000_000) },
    taskID: 'conversation',
  });
});

test('#conversation.retry answers a repeat of the same action with its first answer', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const laptopClient = buildTestClient(ctx.url, laptop.token);

  await laptopClient.conversation.send({
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'What is on today?',
    spans: [],
  });

  const failed = await claimTask(ctx.context, { holder: 'step-runner', leaseMs: 60_000 });

  invariant(failed);

  await runTaskStep(ctx.context, failed, {
    runStep: () => Promise.reject(new Error('the provider is overloaded')),
    leaseMs: 60_000,
    logger: () => {},
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const first = await laptopClient.conversation.retry({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
  });

  ctx.clock.advance(60_000);

  const repeat = await laptopClient.conversation.retry({
    clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
  });

  expect(repeat).toStrictEqual(first);
});

test.each([
  ['NOTHING_TO_RETRY', 'whose last turn did not fail', async () => {}],
  [
    'CLIENT_ACTION_ID_REUSED',
    'with an action ID that a forget used',
    async (client: ReturnType<typeof buildTestClient>) => {
      const sent = await client.conversation.send({
        clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
        thread: 'conversation',
        text: 'Is the pool heated?',
        spans: [],
      });

      await client.conversation.forget({
        clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
        sequence: sent.sequence,
        thread: 'conversation',
      });
    },
  ],
  [
    'UNAUTHORIZED',
    'from a session that was revoked',
    async (client: ReturnType<typeof buildTestClient>, sessionID: string) => {
      await client.sessions.revoke({
        clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
        sessionID,
      });
    },
  ],
] as const)(
  '#conversation.retry answers %s to a retry %s, and revives nothing',
  async (code, _, seed) => {
    const ctx = await setupTest();

    await createConversationTask(ctx.context);

    const laptop = await createDeviceSession(ctx.context, 'laptop');

    const laptopClient = buildTestClient(ctx.url, laptop.token);

    await seed(laptopClient, laptop.sessionID);

    const refused = await laptopClient.conversation
      .retry({ clientActionID: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85' })
      .then(
        () => null,
        (error: unknown) => error,
      );

    const revivals = await readRecords(ctx.context.log, {
      afterSequence: 0,
      kinds: ['task.revived'],
    });

    expect(refused).toMatchObject({ code });
    expect(revivals).toStrictEqual([]);
  },
);
