import { expect, test } from 'bun:test';
import type { ActionsTables } from '@heynixie/actions';
import { readRecords, writeRecords } from '@heynixie/log';
import { createConversationTask, writeTaskControl } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { readRecordLookups } from './read-record-lookups';
import { startTestAPI } from './test-utils/start-test-api';

function setupTest() {
  return startTestAPI();
}

test('it reads the actions each stop cancelled and the names of the started tasks', async () => {
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

  const stop = await writeTaskControl(ctx.context, { taskID: 'conversation', control: 'stop' });

  invariant(stop.status === 'controlled');

  await ctx.writer.db
    .$extendTables<ActionsTables>()
    .insertInto('actions')
    .values({
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
    })
    .execute();

  const entries = await readRecords(ctx.context.log, { afterSequence: 0, thread: 'conversation' });

  const lookups = await readRecordLookups(
    ctx.context,
    entries.map((entry) => entry.record),
  );

  expect(lookups).toStrictEqual({
    cancelledActionIDs: new Set(),
    stopCancelledActions: new Map([
      [stop.sequence, [{ actionID: 'b3f1c7e2-5a9d-4e61-8c2f-7d0a1e3b5c94', tool: 'test.send' }]],
    ]),
    taskDirectory: [
      {
        taskID: 'conversation',
        name: 'Conversation',
        brief: 'Talks with the owner and answers each message.',
        isWokenByMessages: true,
      },
      {
        taskID: 'k3x9m2p7qa',
        name: 'Garden plan',
        brief: 'Plan the beds.',
        isWokenByMessages: true,
      },
    ],
  });
});

test('it reads no started task for records that name no task', async () => {
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
  ]);

  const entries = await readRecords(ctx.context.log, { afterSequence: 0, thread: 'conversation' });

  const lookups = await readRecordLookups(
    ctx.context,
    entries.map((entry) => entry.record),
  );

  expect(lookups.taskDirectory.map((profile) => profile.taskID)).toStrictEqual(['conversation']);
});
