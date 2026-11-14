import { expect, test } from 'bun:test';
import { withWriteTransaction, writeRecords, writeRecordsInTransaction } from '@heynixie/log';
import { createConversationTask, writeTaskControl } from '@heynixie/tasks';
import { seedConversationStep } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { readThreadPage } from './read-thread-page';
import { buildSeeder } from './test-utils/build-seeder';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import { writeOwnerMessage } from './write-owner-message';

async function setupTest() {
  const api = await startTestAPI();

  return { ...api, seed: buildSeeder(api) };
}

test('it reads the page before a sequence, newest last', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const sendText = (text: string) =>
    writeOwnerMessage(ctx.context, laptop.caller, {
      clientMessageId: crypto.randomUUID(),
      thread: 'conversation',
      text,
      spans: [{ start: 0, end: text.length, source: 'typed' }],
    });

  await sendText('one').then(() => sendText('two'));

  const three = await sendText('three');

  invariant(three.status === 'written');

  const page = await readThreadPage(ctx.context, {
    thread: 'conversation',
    beforeSequence: three.sequence,
    limit: 1,
  });

  expect(page?.hasEarlier).toBeTrue();
  expect(page?.readAtSequence).toBe(three.sequence);
  expect(page?.records.map((record) => record.message?.text)).toStrictEqual(['two']);
});

test('it reaches back to the call of a tool result that the page holds without it', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const sent = await writeOwnerMessage(ctx.context, laptop.caller, {
    clientMessageId: crypto.randomUUID(),
    thread: 'conversation',
    text: 'Ask the garden plan where the beans go.',
    spans: [{ start: 0, end: 39, source: 'typed' }],
  });

  invariant(sent.status === 'written');

  const [called] = await writeRecords(ctx.context.log, [
    {
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        callID: 'call-1',
        runID: 'conversation',
        toolUseID: null,
        tool: 'task.message',
        model: 'test-model',
        profile: 'test',
      },
      erasable: { input: { to: 'k3vq8m2xpa', kind: 'question', body: 'Where do the beans go?' } },
    },
  ]);

  invariant(called);

  await writeRecords(ctx.context.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      parent: called.sequence,
      payload: {
        callID: 'call-1',
        runID: 'conversation',
        toolUseID: null,
        outcome: 'result',
        actionID: null,
        sources: {},
      },
      erasable: { result: { messageID: 'r4t8w2qz6n', woke: true, hop: 1 } },
    },
  ]);

  const page = await readThreadPage(ctx.context, { thread: 'conversation', limit: 1 });

  expect({
    calls: page?.records.map((record) => record.toolCall?.callID),
    hasEarlier: page?.hasEarlier,
  }).toStrictEqual({ calls: ['call-1', 'call-1'], hasEarlier: true });
});

test('it reaches back again when the reach takes in the result of an earlier call', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const [callA, callB] = await writeRecords(
    ctx.context.log,
    ['call-a', 'call-b'].map((callID) => ({
      kind: 'tool_called',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        callID,
        runID: 'conversation',
        toolUseID: null,
        tool: 'task.message',
        model: 'test-model',
        profile: 'test',
      },
      erasable: { input: { to: 'k3vq8m2xpa', kind: 'chat', body: 'The peas are up.' } },
    })),
  );

  invariant(callA && callB);

  await writeRecords(
    ctx.context.log,
    [
      { callID: 'call-a', parent: callA.sequence },
      { callID: 'call-b', parent: callB.sequence },
    ].map((result) => ({
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      parent: result.parent,
      payload: {
        callID: result.callID,
        runID: 'conversation',
        toolUseID: null,
        outcome: 'result',
        actionID: null,
        sources: {},
      },
      erasable: { result: { messageID: `m-${result.callID}`, woke: true, hop: 1 } },
    })),
  );

  const page = await readThreadPage(ctx.context, { thread: 'conversation', limit: 1 });

  expect(page?.records.map((record) => record.toolCall?.callID)).toStrictEqual([
    'call-a',
    'call-b',
    'call-a',
    'call-b',
  ]);
});

test('it shows a failed tool result as cancelled when a stop cancelled its action', async () => {
  const ctx = await setupTest();
  const step = await seedConversationStep(ctx.context);
  const failed = await ctx.seed.failedAction({ step: step.claim });
  const cancelled = await ctx.seed.action({ step: step.claim });

  await writeTaskControl(ctx.context, { taskID: 'conversation', control: 'stop' });

  await writeRecords(ctx.context.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        callID: 'call-1',
        runID: 'conversation',
        toolUseID: null,
        outcome: 'failed',
        actionID: cancelled.action_id,
        sources: {},
      },
    },
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        callID: 'call-2',
        runID: 'conversation',
        toolUseID: null,
        outcome: 'failed',
        actionID: failed.action_id,
        sources: {},
      },
    },
  ]);

  const page = await readThreadPage(ctx.context, { thread: 'conversation' });

  expect(page?.records.flatMap((record) => record.toolCall ?? [])).toStrictEqual([
    { callID: 'call-1', outcome: 'cancelled' },
    { callID: 'call-2', outcome: 'failed' },
  ]);
});

test('it lists on a stop the actions that stop cancelled, by its sequence', async () => {
  const ctx = await setupTest();
  const firstStep = await seedConversationStep(ctx.context);
  const first = await ctx.seed.action({ step: firstStep.claim });

  const firstStop = await writeTaskControl(ctx.context, {
    taskID: 'conversation',
    control: 'stop',
  });

  invariant(firstStop.status === 'controlled');

  await writeTaskControl(ctx.context, { taskID: 'conversation', control: 'restart' });

  const secondStep = await seedConversationStep(ctx.context);
  const second = await ctx.seed.action({ step: secondStep.claim, tool: 'test.archive' });

  const secondStop = await writeTaskControl(ctx.context, {
    taskID: 'conversation',
    control: 'stop',
  });

  invariant(secondStop.status === 'controlled');

  const page = await readThreadPage(ctx.context, { thread: 'conversation' });

  const stops = page?.records.filter((record) => record.kind === 'task.stopped');

  expect(stops?.map((record) => ({ sequence: record.sequence, stop: record.stop }))).toStrictEqual([
    {
      sequence: firstStop.sequence,
      stop: { cancelledActions: [{ actionID: first.action_id, tool: 'test.send' }] },
    },
    {
      sequence: secondStop.sequence,
      stop: { cancelledActions: [{ actionID: second.action_id, tool: 'test.archive' }] },
    },
  ]);
});

test('it names the sender of a task message from a task the conversation started', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  await writeRecords(ctx.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: {
        taskID: 'k3x9m2p7qa',
        isConversation: false,
        state: 'waiting',
        startedBy: 'conversation',
      },
      erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
    },
    {
      kind: 'task_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        messageID: 'm7q2x9k4pa',
        from: 'k3x9m2p7qa',
        to: 'conversation',
        kind: 'report',
        replyTo: null,
        onBehalfOf: [],
        hop: 1,
        hopLimit: 20,
        wake: true,
        woke: true,
        opensWait: false,
        source: 'task:k3x9m2p7qa',
      },
      erasable: { body: 'The beds are planned.' },
    },
  ]);

  const page = await readThreadPage(ctx.context, { thread: 'conversation' });

  expect(page?.records.find((record) => record.kind === 'task_message')?.taskMessage).toStrictEqual(
    {
      from: 'k3x9m2p7qa',
      fromName: 'Garden plan',
      hop: 1,
      kind: 'report',
      messageID: 'm7q2x9k4pa',
      text: 'The beds are planned.',
      to: 'conversation',
      woke: true,
    },
  );
});

test('it reads a whole short thread with no earlier page', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const page = await readThreadPage(ctx.context, { thread: 'conversation' });

  expect(page?.hasEarlier).toBeFalse();
  expect(page?.records.map((record) => record.kind)).toStrictEqual(['task.created']);
});

test("it reads the thread's newest step end when newer records push it off the page", async () => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.writer, (tx) =>
    writeRecordsInTransaction(tx, ctx.context.log, [
      {
        kind: 'task.step_errored',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        payload: {
          taskID: 'conversation',
          stepKey: 'conversation:1',
          nextState: 'ready',
          errors: 3,
          errorLimit: 3,
          claimableAt: 1_120_000,
        },
        erasable: { message: 'the provider is overloaded' },
      },
      {
        kind: 'task.step_started',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        payload: { taskID: 'conversation', stepKey: 'conversation:1', generation: 1 },
      },
    ]),
  );

  const page = await readThreadPage(ctx.context, { thread: 'conversation', limit: 1 });

  expect(page?.records.map((record) => record.kind)).toStrictEqual(['task.step_started']);

  expect(page?.lastStepEnd).toMatchObject({
    kind: 'task.step_errored',
    task: { errorLimit: 3, errors: 3, taskID: 'conversation' },
  });
});

test('it reads no step end for a thread whose task never ended a step', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const page = await readThreadPage(ctx.context, { thread: 'conversation' });

  expect(page?.lastStepEnd).toBeNull();
});

test('it answers null for a thread with no records', async () => {
  const ctx = await setupTest();
  const result = await readThreadPage(ctx.context, { thread: 'task-404' });

  expect(result).toBeNull();
});
