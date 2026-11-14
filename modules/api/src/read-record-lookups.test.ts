import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { createConversationTask, writeTaskControl } from '@heynixie/tasks';
import { seedConversationStep } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { readRecordLookups } from './read-record-lookups';
import { buildSeeder } from './test-utils/build-seeder';
import { startTestAPI } from './test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();

  return { ...api, seed: buildSeeder(api) };
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

  const step = await seedConversationStep(ctx.context);
  const action = await ctx.seed.action({ step: step.claim });
  const stop = await writeTaskControl(ctx.context, { taskID: 'conversation', control: 'stop' });

  invariant(stop.status === 'controlled');

  const entries = await readRecords(ctx.context.log, { afterSequence: 0, thread: 'conversation' });

  const lookups = await readRecordLookups(
    ctx.context,
    entries.map((entry) => entry.record),
  );

  expect(lookups).toStrictEqual({
    cancelledActionIDs: new Set(),
    removedSequences: new Set(),
    stopCancelledActions: new Map([
      [stop.sequence, [{ actionID: action.action_id, tool: 'test.send' }]],
    ]),
    taskDirectory: [
      {
        taskID: 'conversation',
        name: 'Conversation',
        brief: 'Talks with the owner and answers each message.',
        isWokenByMessages: true,
        speaker: 'conversation',
      },
      {
        taskID: 'k3x9m2p7qa',
        name: 'Garden plan',
        brief: 'Plan the beds.',
        isWokenByMessages: true,
        speaker: 'plain_task',
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
