import { expect, test } from 'bun:test';
import { runProjectionRebuild, writeRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import type { TasksTables } from './index';
import {
  claimTask,
  createConversationTask,
  createSystemTask,
  readInbox,
  runDueTimers,
  writeInboxRecords,
  writeStepCommit,
  writeStepError,
} from './index';
import { tasksProjections } from './tasks-projections';
import { createTestClaim } from './test-utils/create-test-claim';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeTestTaskMessage } from './test-utils/write-test-task-message';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it lists the tasks projection before the timers projection that refers to it', () => {
  expect(tasksProjections.map((projection) => projection.table)).toStrictEqual([
    'tasks',
    'timers',
    'task_messages',
    'message_routes',
  ]);
});

test('it rebuilds the tasks table equal to the live one after a commit and a message', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'check back in a minute');

  await writeStepCommit(ctx.context, claim, { next: 'wait', records: [], acknowledged: [] });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: claim.lease.workID,
    },
  ]);

  const live = await ctx.db.selectFrom('tasks').selectAll().execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db.selectFrom('tasks').selectAll().execute();

  expect(live).toHaveLength(1);
  expect(rebuilt).toStrictEqual(live);
});

test('it leaves a message from before a reset of the thread unread by the next step', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'check back in a minute');

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: claim.lease.workID,
    },
  ]);

  await writeRecords(ctx.context.log, [
    {
      kind: 'log_reset',
      definitions: { snapshotHash: 'sha256:test' },
      thread: claim.lease.workID,
      payload: { resetAt: 1_760_000_000_000, lastSequence: 3, mode: 'conversations' },
    },
  ]);

  const inbox = await readInbox(ctx.context, claim.lease.workID);

  expect(inbox).toStrictEqual([]);
});

test('it rebuilds the tasks table equal to the live one after a reset of the thread', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'check back in a minute');

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: claim.lease.workID,
    },
  ]);

  const [reset] = await writeRecords(ctx.context.log, [
    {
      kind: 'log_reset',
      definitions: { snapshotHash: 'sha256:test' },
      thread: claim.lease.workID,
      payload: { resetAt: 1_760_000_000_000, lastSequence: 3, mode: 'conversations' },
    },
  ]);

  const live = await ctx.db.selectFrom('tasks').selectAll().execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db.selectFrom('tasks').selectAll().execute();

  invariant(reset);

  expect(live.map((row) => row.read_cursor)).toStrictEqual([reset.sequence]);
  expect(rebuilt).toStrictEqual(live);
});

test('it rebuilds the tasks table equal to the live one after a step error', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'tidy the inbox');

  await writeStepError(ctx.context, claim, {
    error: new Error('the model profile is unreachable'),
    maxStepErrors: 3,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const live = await ctx.db.selectFrom('tasks').selectAll().execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db.selectFrom('tasks').selectAll().execute();

  expect(live).toHaveLength(1);
  expect(rebuilt).toStrictEqual(live);
});

test('it rebuilds the timers table equal to the live one after a timer fires', async () => {
  const ctx = await setupTest();
  const claim = await createTestClaim(ctx.context, 'check back in a minute');

  await writeStepCommit(ctx.context, claim, {
    next: 'wait',
    records: [],
    acknowledged: [],
    timers: [{ dueAt: 1_060_000 }],
  });

  ctx.clock.advance(60_000);

  await runDueTimers(ctx.context);

  const live = await ctx.db.selectFrom('timers').selectAll().execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db.selectFrom('timers').selectAll().execute();

  expect(live).toHaveLength(1);
  expect(rebuilt).toStrictEqual(live);
});

test('it rebuilds the task messages and their waits equal to the live ones after a reply', async () => {
  const ctx = await setupTest();

  const messaging = {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 20,
  };

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);

  const planner = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(planner);

  const question = await writeTestTaskMessage(ctx.context, messaging, {
    from: 'planner',
    to: 'conversation',
    kind: 'question',
    body: 'Is Tuesday free?',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  invariant(question.status === 'sent');

  await writeTestTaskMessage(ctx.context, messaging, {
    from: 'planner',
    to: 'conversation',
    kind: 'request',
    body: 'Hold Wednesday too.',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  await writeStepCommit(ctx.context, planner, { next: 'wait', records: [], acknowledged: [] });
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await writeTestTaskMessage(ctx.context, messaging, {
    from: 'conversation',
    to: 'planner',
    kind: 'reply',
    body: 'Tuesday is free.',
    replyTo: question.messageID,
    onBehalfOf: [],
    wake: true,
  });

  const live = await ctx.db
    .selectFrom('task_messages')
    .selectAll()
    .orderBy('sent_sequence')
    .execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db
    .selectFrom('task_messages')
    .selectAll()
    .orderBy('sent_sequence')
    .execute();

  expect(live.map((row) => row.wait_state)).toStrictEqual(['answered', 'open', 'none']);
  expect(rebuilt).toStrictEqual(live);
});

test('it rebuilds where each message went equal to the live routes after a route and its correction', async () => {
  const ctx = await setupTest();

  await createConversationTask(ctx.context);

  await writeRecords(ctx.context.log, [
    {
      kind: 'task.routed',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { taskID: 'k3x9m2p7qa', via: 'start', messageID: null, messages: [1] },
    },
    {
      kind: 'task.routed',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { taskID: 'w8d2n5rt1c', via: 'message', messageID: 'p4m7x2q9za', messages: [1, 2] },
    },
    {
      kind: 'task.route_corrected',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: { message: 2, from: 'w8d2n5rt1c', to: 'conversation' },
    },
  ]);

  const live = await ctx.db
    .selectFrom('message_routes')
    .selectAll()
    .orderBy('message_sequence')
    .execute();

  await runProjectionRebuild(ctx.context.log);

  const rebuilt = await ctx.db
    .selectFrom('message_routes')
    .selectAll()
    .orderBy('message_sequence')
    .execute();

  expect(live).toStrictEqual([
    { message_sequence: 1, task_id: 'w8d2n5rt1c', routed_sequence: 3 },
    { message_sequence: 2, task_id: 'conversation', routed_sequence: 4 },
  ]);

  expect(rebuilt).toStrictEqual(live);
});

test('it releases only the open waits when a task finishes, and leaves an answered question answered', async () => {
  const ctx = await setupTest();

  const messaging = {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 20,
  };

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);

  const planner = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(planner);

  const question = await writeTestTaskMessage(ctx.context, messaging, {
    from: 'planner',
    to: 'conversation',
    kind: 'question',
    body: 'Is Tuesday free?',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  invariant(question.status === 'sent');

  await writeTestTaskMessage(ctx.context, messaging, {
    from: 'planner',
    to: 'conversation',
    kind: 'request',
    body: 'Hold Wednesday too.',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  await writeStepCommit(ctx.context, planner, { next: 'wait', records: [], acknowledged: [] });

  const conversation = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(conversation);

  await writeTestTaskMessage(ctx.context, messaging, {
    from: 'conversation',
    to: 'planner',
    kind: 'reply',
    body: 'Tuesday is free.',
    replyTo: question.messageID,
    onBehalfOf: [],
    wake: true,
  });

  await writeStepCommit(ctx.context, conversation, {
    next: 'wait',
    records: [],
    acknowledged: [],
  });

  const woken = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(woken?.lease.workID === 'planner');

  const inbox = await readInbox(ctx.context, 'planner');

  await writeStepCommit(ctx.context, woken, {
    next: 'done',
    records: [],
    acknowledged: inbox.map((record) => record.sequence),
  });

  const rows = await ctx.db
    .selectFrom('task_messages')
    .select(['kind', 'wait_state'])
    .orderBy('sent_sequence')
    .execute();

  expect(rows).toStrictEqual([
    { kind: 'question', wait_state: 'answered' },
    { kind: 'request', wait_state: 'released' },
    { kind: 'reply', wait_state: 'none' },
  ]);
});

test('it opens a wait for a question recorded before messages said whether they open one', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);

  await writeInboxRecords(ctx.context, [
    {
      kind: 'task_message',
      definitions: ctx.context.definitions(),
      thread: 'conversation',
      payload: {
        messageID: 'p7w2x9qkra',
        from: 'planner',
        to: 'conversation',
        kind: 'question',
        replyTo: null,
        onBehalfOf: [],
        hop: 1,
        hopLimit: 20,
        wake: true,
        woke: true,
        source: 'task:planner',
      },
      erasable: { body: 'Is Tuesday free?' },
    },
  ]);

  const row = await ctx.db
    .selectFrom('task_messages')
    .select('wait_state')
    .where('message_id', '=', 'p7w2x9qkra')
    .executeTakeFirstOrThrow();

  expect(row.wait_state).toBe('open');
});
