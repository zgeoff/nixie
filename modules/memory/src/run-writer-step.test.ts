import { expect, mock, test } from 'bun:test';
import { writeRecords } from '@heynixie/log';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import type { StepInput } from '@heynixie/tasks';
import { claimTask, tasksProjections } from '@heynixie/tasks';
import { buildTestClock, makeGatedCall } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { createWriterStaging } from './create-writer-staging';
import { startMemoryWriter } from './start-memory-writer';
import { startTestMemory } from './test-utils/start-test-memory';
import { writerConfigSchema } from './writer-config-schema';
import type { WriterModel } from './writer-types';

interface WriterSetup {
  readonly runSession?: WriterModel['runSession'];
}

async function setupTest(setup: WriterSetup = {}) {
  const memory = await startTestMemory();

  const log = { ...memory.log, projections: [...memory.log.projections, ...tasksProjections] };
  const clock = buildTestClock(1_000_000);
  const context = { log, clock, definitions: () => ({ snapshotHash: 'sha256:test' }) };
  const session = makeGatedCall(() => Promise.reject(new Error('the provider refused the call')));

  const writer = {
    context,
    store: memory.store,
    publish: memory.store.writeBatch,
    staging: createWriterStaging(),
    model: {
      model: 'claude-test-1',
      profile: 'writer-direct',
      runSession: setup.runSession ?? session.call,
    },
    gate: {
      check: () => Promise.reject(new Error('no write reaches the gate')),
      release: () => Promise.resolve(),
    },
    config: writerConfigSchema.parse({}),
    getPersona: () => '',
    getPrompts: () => ({}),
    ownerName: null,
    assistantName: null,
    defaultZone: 'UTC',
    messaging: { directory: [], hopLimit: 20, ownerName: null },
    onError: () => {},
  };

  return {
    log,
    clock,
    session,
    runStep: async (inbox: StepInput['inbox'] = []) => {
      const started = await startMemoryWriter(writer);

      memory.defer(() => started.stop());

      const claim = await claimTask(context, { holder: 'runner-a', leaseMs: 3_600_000 });

      invariant(claim);

      return started.runStep({
        taskID: claim.lease.workID,
        stepKey: claim.stepKey,
        lease: claim.lease,
        inbox,
        wake: { hop: 0, cause: { kind: 'event' } },
        sessionBoundary: null,
        signal: new AbortController().signal,
      });
    },
  };
}

test('it counts the backoff from the failure, not from the start of a slow batch', async () => {
  const ctx = await setupTest();

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'I keep bees on the roof.' },
    },
  ]);

  const step = ctx.runStep();

  await ctx.session.started;

  ctx.clock.advance(600_000);
  ctx.session.release();

  const result = await step;

  expect(result.timers).toStrictEqual([{ dueAt: 1_630_000 }]);
});

test('it runs no session for a task message alone and leaves the message unread for its next run', async () => {
  const runSession = mock(() =>
    Promise.resolve({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }),
  );

  const ctx = await setupTest({ runSession });

  const message = buildMockLogRecord({
    sequence: 900,
    kind: 'task_message',
    thread: 'memory-writer',
    payload: {
      messageID: 'k3vq8m2xpa',
      from: 'conversation',
      to: 'memory-writer',
      kind: 'request',
      replyTo: null,
      onBehalfOf: [],
      hop: 1,
      hopLimit: 20,
      wake: true,
      woke: false,
      source: 'task:conversation',
    },
    erasable: { status: 'readable', fields: { body: 'Leave the bike note out.' } },
  });

  const result = await ctx.runStep([message]);

  expect(runSession).not.toHaveBeenCalled();
  expect(result.acknowledged).toStrictEqual([]);
});

test('it shows a waiting task message to its next scheduled session and reads it there', async () => {
  const runSession = mock<WriterModel['runSession']>(() =>
    Promise.resolve({ inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0 }),
  );

  const ctx = await setupTest({ runSession });

  await writeRecords(ctx.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'I keep bees on the roof.' },
    },
  ]);

  const message = buildMockLogRecord({
    sequence: 900,
    kind: 'task_message',
    thread: 'memory-writer',
    payload: {
      messageID: 'k3vq8m2xpa',
      from: 'conversation',
      to: 'memory-writer',
      kind: 'request',
      replyTo: null,
      onBehalfOf: [],
      hop: 1,
      hopLimit: 20,
      wake: true,
      woke: false,
      source: 'task:conversation',
    },
    erasable: { status: 'readable', fields: { body: 'Leave the bike note out.' } },
  });

  const result = await ctx.runStep([message]);

  expect(runSession.mock.calls[0]?.[0].prompt).toMatch(
    /\n\nMessages to you from other tasks, outside the batch:\n\n<task-message id="k3vq8m2xpa" from="conversation" [^>]+>\nThis message is from another task, not from the owner\.\nLeave the bike note out\.\n<\/task-message block="\w+">$/u,
  );

  expect(result.acknowledged).toStrictEqual([900]);
});
