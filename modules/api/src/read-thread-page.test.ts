import { expect, test } from 'bun:test';
import type { ActionsTables } from '@heynixie/actions';
import { withWriteTransaction, writeRecords, writeRecordsInTransaction } from '@heynixie/log';
import { createConversationTask, writeTaskControl } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { readThreadPage } from './read-thread-page';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';
import { writeOwnerMessage } from './write-owner-message';

function setupTest() {
  return startTestAPI();
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

test('it shows a failed tool result as cancelled when a stop cancelled its action', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  await withWriteTransaction(ctx.writer, async (tx) => {
    await tx
      .$extendTables<ActionsTables>()
      .insertInto('actions')
      .values([
        {
          action_id: 'b3f1c7e2-5a9d-4e61-8c2f-7d0a1e3b5c94',
          task_id: 'conversation',
          step_key: 'conversation:1',
          action_hash: 'sha256:send-1',
          tool: 'test.send',
          status: 'pending',
          attempt_count: 0,
          attempt_open: 0,
          next_attempt_at: 0,
          reason: null,
          queued_sequence: 1,
          outcome_sequence: null,
          cancelled_sequence: 1,
          updated_sequence: 1,
        },
        {
          action_id: 'e8a2d4f6-1b3c-4d5e-9f70-2a4c6e8b0d13',
          task_id: 'conversation',
          step_key: 'conversation:1',
          action_hash: 'sha256:send-2',
          tool: 'test.send',
          status: 'failed',
          attempt_count: 1,
          attempt_open: 0,
          next_attempt_at: 0,
          reason: 'refused',
          queued_sequence: 1,
          outcome_sequence: null,
          cancelled_sequence: null,
          updated_sequence: 1,
        },
      ])
      .execute();

    await writeRecordsInTransaction(tx, ctx.context.log, [
      {
        kind: 'tool_result',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'conversation',
        payload: {
          callID: 'call-1',
          runID: 'conversation',
          toolUseID: null,
          outcome: 'failed',
          actionID: 'b3f1c7e2-5a9d-4e61-8c2f-7d0a1e3b5c94',
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
          actionID: 'e8a2d4f6-1b3c-4d5e-9f70-2a4c6e8b0d13',
          sources: {},
        },
      },
    ]);
  });

  const page = await readThreadPage(ctx.context, { thread: 'conversation' });

  expect(page?.records.flatMap((record) => record.toolCall ?? [])).toStrictEqual([
    { callID: 'call-1', outcome: 'cancelled' },
    { callID: 'call-2', outcome: 'failed' },
  ]);
});

test('it lists on a stop the actions that stop cancelled, by its sequence', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const stop = await writeTaskControl(ctx.context, { taskID: 'conversation', control: 'stop' });

  invariant(stop.status === 'controlled');

  await ctx.writer.db
    .$extendTables<ActionsTables>()
    .insertInto('actions')
    .values([
      {
        action_id: 'b3f1c7e2-5a9d-4e61-8c2f-7d0a1e3b5c94',
        task_id: 'conversation',
        step_key: 'conversation:1',
        action_hash: 'sha256:send-1',
        tool: 'test.send',
        status: 'pending',
        attempt_count: 0,
        attempt_open: 0,
        next_attempt_at: 0,
        reason: null,
        queued_sequence: 1,
        outcome_sequence: null,
        cancelled_sequence: stop.sequence,
        updated_sequence: stop.sequence,
      },
      {
        action_id: 'e8a2d4f6-1b3c-4d5e-9f70-2a4c6e8b0d13',
        task_id: 'conversation',
        step_key: 'conversation:1',
        action_hash: 'sha256:send-2',
        tool: 'test.archive',
        status: 'pending',
        attempt_count: 0,
        attempt_open: 0,
        next_attempt_at: 0,
        reason: null,
        queued_sequence: 1,
        outcome_sequence: null,
        cancelled_sequence: stop.sequence - 1,
        updated_sequence: stop.sequence,
      },
    ])
    .execute();

  const page = await readThreadPage(ctx.context, { thread: 'conversation' });

  expect(page?.records.find((record) => record.kind === 'task.stopped')?.stop).toStrictEqual({
    cancelledActions: [{ actionID: 'b3f1c7e2-5a9d-4e61-8c2f-7d0a1e3b5c94', tool: 'test.send' }],
  });
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
