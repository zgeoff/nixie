import { expect, test } from 'bun:test';
import { readRecords, withWriteTransaction, writeRecords } from '@heynixie/log';
import { writeReminderVersion } from '@heynixie/reminders';
import { createConversationTask, writeTaskControl } from '@heynixie/tasks';
import { seedDefinitionTask, seedEndedDefinitionRun } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { startTestAPI } from '../test-utils/start-test-api';
import { startTestAPIDefinitions } from '../test-utils/start-test-api-definitions';
import { readRecordLookups } from './read-record-lookups';

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

  const step = await ctx.seed.conversationStep();
  const action = await ctx.seed.action({ step: step.claim });
  const stop = await writeTaskControl(ctx.context, { taskID: 'conversation', control: 'stop' });

  invariant(stop.status === 'controlled');

  const entries = await readRecords(ctx.context.log, { afterSequence: 0, thread: 'conversation' });

  const lookups = await readRecordLookups(
    ctx.context,
    entries.map((entry) => entry.record),
  );

  expect(lookups).toStrictEqual({
    actions: new Map(),
    cancelledActionIDs: new Set(),
    definitionNotices: new Map(),
    proposals: new Map(),
    reminders: new Map(),
    removedSequences: new Set(),
    stopCancelledActions: new Map([
      [stop.sequence, [{ actionID: action.action_id, tool: 'test.send' }]],
    ]),
    taskDirectory: [
      {
        taskID: 'conversation',
        name: 'Conversation',
        brief: 'Talks with the owner and answers each message.',
        wakeable: true,
        speaker: 'conversation',
      },
      {
        taskID: 'k3x9m2p7qa',
        name: 'Garden plan',
        brief: 'Plan the beds.',
        wakeable: true,
        speaker: 'plain_task',
      },
    ],
  });
});

test('it reads the name of a definition task that left force after its task run ended', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { name: 'Water the tomatoes' },
  });

  await seedEndedDefinitionRun(ctx.context, {
    taskID,
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await seedDefinitionTask(ctx, { definitionID: 'water-the-tomatoes', definitionHash: null });

  const [message] = await writeRecords(ctx.context.log, [
    {
      kind: 'task_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        messageID: 'm7q2x9k4pa',
        from: taskID,
        to: 'conversation',
        kind: 'report',
        replyTo: null,
        onBehalfOf: [],
        hop: 1,
        hopLimit: 20,
        wake: true,
        woke: true,
        opensWait: false,
        source: `task:${taskID}`,
      },
      erasable: { body: 'The beds are watered.' },
    },
  ]);

  invariant(message);

  const lookups = await readRecordLookups(ctx.context, [message]);

  expect(
    lookups.taskDirectory
      .filter((profile) => profile.taskID === taskID)
      .map((profile) => profile.name),
  ).toStrictEqual(['Water the tomatoes']);
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

test('it reads the tool of the action that each outcome record names', async () => {
  const ctx = await setupTest();
  const step = await ctx.seed.conversationStep();
  const action = await ctx.seed.action({ step: step.claim });

  const [outcome] = await writeRecords(ctx.context.log, [
    {
      kind: 'action.outcome',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { actionID: action.action_id, status: 'done', attempt: 1, reason: null },
      erasable: { result: {} },
    },
  ]);

  invariant(outcome);

  const entries = await readRecords(ctx.context.log, { afterSequence: outcome.sequence - 1 });

  const lookups = await readRecordLookups(
    ctx.context,
    entries.map((entry) => entry.record),
  );

  expect(lookups.actions).toStrictEqual(
    new Map([[action.action_id, { tool: 'test.send', callSequence: null }]]),
  );
});

test.each([
  [
    'the name and the note of the pinned version',
    'hash-1',
    { name: 'Dentist', note: 'Call the dentist about the crown.' },
  ],
  [
    'a note for a version that is no longer stored',
    'hash-gone',
    { name: null, note: '[a reminder whose text is no longer stored]' },
  ],
])('it reads %s for a fire on the conversation thread', async (_name, hash, expected) => {
  const ctx = await setupTest();

  await withWriteTransaction(ctx.context.log.writer, (tx) =>
    writeReminderVersion(tx, 'hash-1', {
      name: 'Dentist',
      note: 'Call the dentist about the crown.',
      trigger: { at: '2027-03-09T14:00:00+11:00' },
    }),
  );

  const [fire] = await writeRecords(ctx.context.log, [
    {
      kind: 'trigger.fired',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {
        definitionID: 'reminder:one',
        definitionHash: hash,
        source: 'schedule',
        dedupeKey: 'key-1',
        kind: 'at',
        scheduledFor: '2027-03-09T03:00:00.000Z',
        firedAt: '2027-03-09T03:00:00.000Z',
        isCatchUp: false,
        skipped: [],
        skippedCount: 0,
      },
    },
  ]);

  invariant(fire);

  const lookups = await readRecordLookups(ctx.context, [fire]);

  expect(lookups.reminders).toStrictEqual(new Map([[fire.sequence, expected]]));
});

test('it reads no reminder for a fire on the thread of a task', async () => {
  const ctx = await setupTest();

  const [fire] = await writeRecords(ctx.context.log, [
    {
      kind: 'trigger.fired',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'water-the-tomatoes',
      payload: {
        definitionID: 'water-the-tomatoes',
        definitionHash: 'hash-1',
        source: 'schedule',
        dedupeKey: 'key-1',
        kind: 'schedule',
        scheduledFor: '2027-03-09T03:00:00.000Z',
        firedAt: '2027-03-09T03:00:00.000Z',
        isCatchUp: false,
        skipped: [],
        skippedCount: 0,
      },
    },
  ]);

  invariant(fire);

  const lookups = await readRecordLookups(ctx.context, [fire]);

  expect(lookups.reminders).toStrictEqual(new Map());
});

test('it reads the notice of each definition change by the sequence of its record', async () => {
  const ctx = await setupTest();
  const definitions = await startTestAPIDefinitions(ctx);
  const added = await definitions.define();

  const entries = await readRecords(ctx.context.log, {
    afterSequence: 0,
    kinds: ['definition.changed'],
  });

  const lookups = await readRecordLookups(
    ctx.context,
    entries.map((entry) => entry.record),
  );

  expect([...lookups.definitionNotices.values()]).toStrictEqual([
    expect.objectContaining({
      changeID: added.changeID,
      name: 'Water the tomatoes',
      operation: 'add',
      state: 'in_force',
    }),
  ]);
});
