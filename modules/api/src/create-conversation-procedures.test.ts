import { expect, mock, onTestFinished, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import type { CleanupSessions } from '@heynixie/memory';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  startMemoryStore,
} from '@heynixie/memory';
import { claimTask, createConversationTask, runTaskStep } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();

  const memory = await startMemoryStore({
    log: api.context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    cleanupSessions: mock<CleanupSessions>(() => Promise.resolve()),
    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'unsure',
          reason: 'no checker is wired',
          model: 'no-checker',
          failure: 'error',
        }),
      clock: api.clock,
      defaultZone: 'UTC',
      findAllowRule: findNoAllowRule,
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  onTestFinished(() => memory.stop());

  api.setMemory(memory);

  return { ...api, memory };
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

test('#conversation.previewForget counts the live moments that hold the record and lists the items that quote it', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const sent = await client.conversation.send({
    clientMessageId: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    thread: 'conversation',
    text: 'The cat learned the flap today',
    spans: [],
  });

  const later = await client.conversation.send({
    clientMessageId: '5f2c7a14-8e3b-4c9d-a1f0-6b2e9d3c7a85',
    thread: 'conversation',
    text: 'Then it went out',
    spans: [],
  });

  const keep = (title: string, firstSequence: number, lastSequence: number) =>
    ctx.memory.moments.keep({
      caller: { kind: 'owner' },
      thread: 'conversation',
      firstSequence,
      lastSequence,
      title,
    });

  await keep('The cat flap', sent.sequence, later.sequence);
  await keep('The first night', sent.sequence, sent.sequence);
  await keep('Later on', later.sequence, later.sequence);

  const destroyed = await keep('Gone', sent.sequence, sent.sequence);

  invariant(destroyed.status === 'written');

  await ctx.memory.moments.destroy({ momentID: destroyed.momentID, version: 1 });

  const quoting = await ctx.memory.remember({
    text: 'The cat uses the flap',
    evidence: { recordSequence: sent.sequence, start: 0, end: 7 },
    evidenceQuote: 'The cat',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await ctx.memory.remember({
    text: 'The cat goes out at night',
    evidence: { recordSequence: later.sequence, start: 0, end: 4 },
    evidenceQuote: 'Then',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const preview = await client.conversation.previewForget({
    thread: 'conversation',
    sequence: sent.sequence,
  });

  expect(preview).toStrictEqual({
    momentCount: 2,
    memoryItems: [{ itemID: quoting.itemID, text: 'The cat uses the flap' }],
  });
});

test('#conversation.previewForget refuses an unknown sequence', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);
  const refused = client.conversation.previewForget({ thread: 'conversation', sequence: 9999 });

  await refused.catch(() => {});

  expect(refused).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
});

test('#conversation.previewForget refuses a record of another thread', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [written] = await writeRecords(ctx.context.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'other-thread',
      erasable: { text: 'Is the pool heated?' },
    },
  ]);

  invariant(written);

  const refused = client.conversation.previewForget({
    thread: 'conversation',
    sequence: written.sequence,
  });

  await refused.catch(() => {});

  expect(refused).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
});

test('#conversation.previewForget refuses a record of a kind that cannot be forgotten', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const [written] = await writeRecords(ctx.context.log, [
    {
      kind: 'task.revived',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { taskID: 'conversation' },
    },
  ]);

  invariant(written);

  const refused = client.conversation.previewForget({
    thread: 'conversation',
    sequence: written.sequence,
  });

  await refused.catch(() => {});

  expect(refused).rejects.toMatchObject({ code: 'RECORD_NOT_FOUND' });
});
