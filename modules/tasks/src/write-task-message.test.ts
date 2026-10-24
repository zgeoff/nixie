import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { createSystemTask } from './create-system-task';
import { makeStubStep } from './test-utils/make-stub-step';
import { runTaskSteps } from './test-utils/run-task-steps';
import { startTestTasks } from './test-utils/start-test-tasks';
import type { TasksTables } from './types';
import { writeInboxRecords } from './write-inbox-records';
import { writeStepCommit } from './write-step-commit';
import { writeTaskMessage } from './write-task-message';

async function setupTest() {
  const tasks = await startTestTasks();

  return { ...tasks, db: tasks.writer.db.$extendTables<TasksTables>() };
}

test('it delivers a message to the task it names and wakes it', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const outcome = await writeTaskMessage(
    ctx.context,
    {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
      ],
      hopLimit: 20,
    },
    {
      from: 'planner',
      to: 'conversation',
      kind: 'report',
      body: 'The week is planned.',
      replyTo: null,
      onBehalfOf: [],
      wake: true,
    },
  );

  const entries = await readRecords(ctx.context.log, { afterSequence: 0, thread: 'conversation' });

  const message = entries.find((entry) => entry.record.kind === 'task_message')?.record;

  const conversation = await ctx.db
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', 'conversation')
    .executeTakeFirstOrThrow();

  expect(outcome).toStrictEqual({
    status: 'sent',
    messageID: expect.toBeString(),
    hop: 1,
    woke: true,
    hold: 'none',
  });

  expect(message).toMatchObject({
    payload: {
      messageID: expect.toBeString(),
      from: 'planner',
      to: 'conversation',
      kind: 'report',
      replyTo: null,
      onBehalfOf: [],
      hop: 1,
      hopLimit: 20,
      wake: true,
      woke: true,
      source: 'task:planner',
    },
    erasable: { status: 'readable', fields: { body: 'The week is planned.' } },
  });

  expect(conversation.state).toBe('ready');
});

test('it leaves the receiver waiting for its next wake when the sender asks for no wake', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const outcome = await writeTaskMessage(
    ctx.context,
    {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
      ],
      hopLimit: 20,
    },
    {
      from: 'planner',
      to: 'conversation',
      kind: 'progress',
      body: 'Half the week is planned.',
      replyTo: null,
      onBehalfOf: [],
      wake: false,
    },
  );

  const conversation = await ctx.db
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', 'conversation')
    .executeTakeFirstOrThrow();

  expect(outcome).toMatchObject({ status: 'sent', woke: false, hold: 'none' });

  const next = await claimTask(ctx.context, { holder: 'runner-b', leaseMs: 60_000 });

  expect(conversation.state).toBe('waiting');
  expect(next).toBeNull();
});

test('it holds a message for a task that runs on its own schedule, with no wake', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const outcome = await writeTaskMessage(
    ctx.context,
    {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: false },
      ],
      hopLimit: 20,
    },
    {
      from: 'planner',
      to: 'conversation',
      kind: 'chat',
      body: 'Nice weather for it.',
      replyTo: null,
      onBehalfOf: [],
      wake: true,
    },
  );

  const conversation = await ctx.db
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', 'conversation')
    .executeTakeFirstOrThrow();

  expect(outcome).toMatchObject({ status: 'sent', woke: false, hold: 'next_run' });
  expect(conversation.state).toBe('waiting');
});

test('it refuses a message to the sender itself', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const outcome = await writeTaskMessage(
    ctx.context,
    {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      ],
      hopLimit: 20,
    },
    {
      from: 'planner',
      to: 'planner',
      kind: 'chat',
      body: 'Hello me.',
      replyTo: null,
      onBehalfOf: [],
      wake: true,
    },
  );

  expect(outcome).toStrictEqual({ status: 'refused', refusal: { reason: 'self' } });
});

test('it refuses a message to a task the directory does not list', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createSystemTask(ctx.context, 'queue-check');
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const outcome = await writeTaskMessage(
    ctx.context,
    {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      ],
      hopLimit: 20,
    },
    {
      from: 'planner',
      to: 'queue-check',
      kind: 'chat',
      body: 'Anything queued?',
      replyTo: null,
      onBehalfOf: [],
      wake: true,
    },
  );

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { reason: 'unknown_task', taskID: 'queue-check' },
  });
});

test('it refuses a message to a task that has finished', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'gardener');
  await createSystemTask(ctx.context, 'planner');

  const gardener = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(gardener);

  await writeStepCommit(ctx.context, gardener, { next: 'done', records: [], acknowledged: [] });
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const outcome = await writeTaskMessage(
    ctx.context,
    {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        { taskID: 'gardener', name: 'Gardener', brief: 'Waters.', isWokenByMessages: true },
      ],
      hopLimit: 20,
    },
    {
      from: 'planner',
      to: 'gardener',
      kind: 'request',
      body: 'Water the ferns.',
      replyTo: null,
      onBehalfOf: [],
      wake: true,
    },
  );

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { reason: 'finished', taskID: 'gardener' },
  });
});

test('it refuses a reply to a message that was never sent to the sender', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const outcome = await writeTaskMessage(
    ctx.context,
    {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
      ],
      hopLimit: 20,
    },
    {
      from: 'planner',
      to: 'conversation',
      kind: 'reply',
      body: 'Yes, Tuesday.',
      replyTo: 'z9z9z9z9z9',
      onBehalfOf: [],
      wake: true,
    },
  );

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { reason: 'unknown_reply', messageID: 'z9z9z9z9z9' },
  });
});

test("it refuses on-behalf-of IDs that do not name the owner's messages", async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const outcome = await writeTaskMessage(
    ctx.context,
    {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
      ],
      hopLimit: 20,
    },
    {
      from: 'planner',
      to: 'conversation',
      kind: 'request',
      body: 'Book the table, as asked.',
      replyTo: null,
      onBehalfOf: ['#1', '#404'],
      wake: true,
    },
  );

  expect(outcome).toStrictEqual({
    status: 'refused',
    refusal: { reason: 'not_owner_message', eventIDs: ['1', '404'] },
  });
});

test("it stores on-behalf-of IDs that name the owner's messages", async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);

  const [owned] = await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'planner',
      contentSource: 'owner',
      erasable: { text: 'book us a table for Friday' },
    },
  ]);

  invariant(owned);

  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await writeTaskMessage(
    ctx.context,
    {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
      ],
      hopLimit: 20,
    },
    {
      from: 'planner',
      to: 'conversation',
      kind: 'request',
      body: 'Book the table, as asked.',
      replyTo: null,
      onBehalfOf: [`#${owned.sequence}`],
      wake: true,
    },
  );

  const entries = await readRecords(ctx.context.log, { afterSequence: 0, thread: 'conversation' });

  const message = entries.find((entry) => entry.record.kind === 'task_message')?.record;

  expect(message?.payload['onBehalfOf']).toStrictEqual([String(owned.sequence)]);
});

test('it delivers a message past the hop limit without a wake and tells the owner once', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(claim);

  await ctx.db.updateTable('tasks').set({ step_hop: 3 }).where('task_id', '=', 'planner').execute();

  const messaging = {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 3,
  };

  const outcome = await writeTaskMessage(ctx.context, messaging, {
    from: 'planner',
    to: 'conversation',
    kind: 'question',
    body: 'Shall I plan Sunday too?',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  await writeTaskMessage(ctx.context, messaging, {
    from: 'planner',
    to: 'conversation',
    kind: 'chat',
    body: 'Or leave it free?',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  const notices = await ctx.db
    .selectFrom('records')
    .select(['thread', 'payload'])
    .where('kind', '=', 'task.exchange_limited')
    .execute();

  const conversation = await ctx.db
    .selectFrom('tasks')
    .select('state')
    .where('task_id', '=', 'conversation')
    .executeTakeFirstOrThrow();

  invariant(outcome.status === 'sent');

  expect(outcome).toStrictEqual({
    status: 'sent',
    messageID: expect.toBeString(),
    hop: 4,
    woke: false,
    hold: 'hop_limit',
  });

  expect(
    notices.map((notice): { readonly thread: string | null; readonly payload: unknown } => ({
      thread: notice.thread,
      payload: JSON.parse(notice.payload),
    })),
  ).toStrictEqual([
    {
      thread: 'planner',
      payload: {
        messageID: outcome.messageID,
        stepKey: claim.stepKey,
        from: 'planner',
        to: 'conversation',
        hops: 3,
        waiting: { taskID: 'planner', onTaskID: 'conversation' },
      },
    },
  ]);

  expect(conversation.state).toBe('waiting');
});

test('it tells the owner nothing waits when the message past the limit asks nothing', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await ctx.db.updateTable('tasks').set({ step_hop: 3 }).where('task_id', '=', 'planner').execute();

  await writeTaskMessage(
    ctx.context,
    {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
      ],
      hopLimit: 3,
    },
    {
      from: 'planner',
      to: 'conversation',
      kind: 'chat',
      body: 'Sunday stays free.',
      replyTo: null,
      onBehalfOf: [],
      wake: true,
    },
  );

  const notice = await ctx.db
    .selectFrom('records')
    .select('payload')
    .where('kind', '=', 'task.exchange_limited')
    .executeTakeFirstOrThrow();

  expect(JSON.parse(notice.payload)).toMatchObject({ waiting: null });
});

test('it stops waking a chain of tasks that message each other at the hop limit', async () => {
  const ctx = await setupTest();

  const messaging = {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'critic', name: 'Critic', brief: 'Checks plans.', isWokenByMessages: true },
    ],
    hopLimit: 3,
  };

  const settle = makeStubStep();

  const makeSend = (from: string, to: string) =>
    makeStubStep(() =>
      writeTaskMessage(ctx.context, messaging, {
        from,
        to,
        kind: 'chat',
        body: 'One more idea.',
        replyTo: null,
        onBehalfOf: [],
        wake: true,
      }),
    );

  await createSystemTask(ctx.context, 'planner');
  await createSystemTask(ctx.context, 'critic');

  await runTaskSteps(ctx.context, {
    steps: { planner: settle, critic: settle },
    advance: (durationMs) => {
      ctx.clock.advance(durationMs);
    },
    maxSteps: 10,
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'planner',
      payload: { at: 0 },
    },
  ]);

  const steps = await runTaskSteps(ctx.context, {
    steps: { planner: makeSend('planner', 'critic'), critic: makeSend('critic', 'planner') },
    advance: (durationMs) => {
      ctx.clock.advance(durationMs);
    },
    maxSteps: 10,
  });

  const messages = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(steps).toBe(4);

  expect(
    messages
      .filter((entry) => entry.record.kind === 'task_message')
      .map((entry) => ({
        to: entry.record.payload['to'],
        hop: entry.record.payload['hop'],
        woke: entry.record.payload['woke'],
      })),
  ).toStrictEqual([
    { to: 'critic', hop: 1, woke: true },
    { to: 'planner', hop: 2, woke: true },
    { to: 'critic', hop: 3, woke: true },
    { to: 'planner', hop: 4, woke: false },
  ]);
});

test('it starts the count again when the owner writes to a task in a held exchange', async () => {
  const ctx = await setupTest();

  const messaging = {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 1,
  };

  const settle = makeStubStep();

  const makeSend = (from: string, to: string) =>
    makeStubStep(() =>
      writeTaskMessage(ctx.context, messaging, {
        from,
        to,
        kind: 'chat',
        body: 'Still here.',
        replyTo: null,
        onBehalfOf: [],
        wake: true,
      }),
    );

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);

  await runTaskSteps(ctx.context, {
    steps: { planner: makeSend('planner', 'conversation'), conversation: settle },
    advance: (durationMs) => {
      ctx.clock.advance(durationMs);
    },
    maxSteps: 10,
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      erasable: { text: 'tell the planner thanks' },
    },
  ]);

  await runTaskSteps(ctx.context, {
    steps: {
      planner: makeSend('planner', 'conversation'),
      conversation: makeSend('conversation', 'planner'),
    },
    advance: (durationMs) => {
      ctx.clock.advance(durationMs);
    },
    maxSteps: 10,
  });

  const messages = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(
    messages
      .filter((entry) => entry.record.kind === 'task_message')
      .map((entry) => ({
        to: entry.record.payload['to'],
        hop: entry.record.payload['hop'],
        woke: entry.record.payload['woke'],
      })),
  ).toStrictEqual([
    { to: 'conversation', hop: 1, woke: true },
    { to: 'planner', hop: 1, woke: true },
    { to: 'conversation', hop: 2, woke: false },
  ]);
});

test('it starts the count again when a timer wakes a task in a held exchange', async () => {
  const ctx = await setupTest();

  const messaging = {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'critic', name: 'Critic', brief: 'Checks plans.', isWokenByMessages: true },
    ],
    hopLimit: 1,
  };

  const settle = makeStubStep();

  const makeSend = (from: string, to: string) =>
    makeStubStep(() =>
      writeTaskMessage(ctx.context, messaging, {
        from,
        to,
        kind: 'chat',
        body: 'Morning check-in.',
        replyTo: null,
        onBehalfOf: [],
        wake: true,
      }),
    );

  await createSystemTask(ctx.context, 'planner');
  await createSystemTask(ctx.context, 'critic');

  await runTaskSteps(ctx.context, {
    steps: { planner: makeSend('planner', 'critic'), critic: settle },
    advance: (durationMs) => {
      ctx.clock.advance(durationMs);
    },
    maxSteps: 10,
  });

  await writeInboxRecords(ctx.context, [
    {
      kind: 'timer.fired',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'critic',
      payload: { taskID: 'critic', timerID: 'timer-a', dueAt: 1_000_000, firedAt: 1_000_000 },
    },
  ]);

  await runTaskSteps(ctx.context, {
    steps: { planner: makeSend('planner', 'critic'), critic: makeSend('critic', 'planner') },
    advance: (durationMs) => {
      ctx.clock.advance(durationMs);
    },
    maxSteps: 10,
  });

  const messages = await readRecords(ctx.context.log, { afterSequence: 0 });

  expect(
    messages
      .filter((entry) => entry.record.kind === 'task_message')
      .map((entry) => ({
        to: entry.record.payload['to'],
        hop: entry.record.payload['hop'],
        woke: entry.record.payload['woke'],
      })),
  ).toStrictEqual([
    { to: 'critic', hop: 1, woke: true },
    { to: 'planner', hop: 1, woke: true },
    { to: 'critic', hop: 2, woke: false },
  ]);
});
