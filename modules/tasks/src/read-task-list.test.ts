import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { createSystemTask } from './create-system-task';
import { readTaskList } from './read-task-list';
import { startTestTasks } from './test-utils/start-test-tasks';
import { writeTestTaskMessage } from './test-utils/write-test-task-message';
import { writeStepCommit } from './write-step-commit';
import { writeStepError } from './write-step-error';

function setupTest() {
  return startTestTasks();
}

test('it lists the other tasks in the directory, the most recently active first', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createSystemTask(ctx.context, 'critic');
  await createSystemTask(ctx.context, 'queue-check');
  await createConversationTask(ctx.context);

  const tasks = await readTaskList(
    ctx.context,
    {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        { taskID: 'critic', name: 'Critic', brief: 'Checks plans.', isWokenByMessages: true },
        { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
      ],
    },
    { callerID: 'conversation', state: 'all', limit: 20 },
  );

  expect(tasks).toStrictEqual([
    {
      id: 'critic',
      name: 'Critic',
      state: 'ready',
      brief: 'Checks plans.',
      lastActivityAt: expect.toBeValidDate(),
    },
    {
      id: 'planner',
      name: 'Planner',
      state: 'ready',
      brief: 'Plans the week.',
      lastActivityAt: expect.toBeValidDate(),
    },
  ]);
});

test('it lists only the tasks in the state the caller asks for', async () => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'planner');
  await createConversationTask(ctx.context);

  const tasks = await readTaskList(
    ctx.context,
    {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
      ],
    },
    { callerID: 'critic', state: 'waiting', limit: 20 },
  );

  expect(tasks.map((task) => task.id)).toStrictEqual(['conversation']);
});

test('it shows a task that asked a question as waiting on the task it asked', async () => {
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
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  await writeTestTaskMessage(ctx.context, messaging, {
    from: 'planner',
    to: 'conversation',
    kind: 'question',
    body: 'Is Tuesday free?',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  const tasks = await readTaskList(ctx.context, messaging, {
    callerID: 'conversation',
    state: 'all',
    limit: 20,
  });

  expect(tasks).toMatchObject([{ id: 'planner', waitingOn: 'conversation' }]);
});

test('it clears the wait when the asked task replies to the question, by its ID', async () => {
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

  await writeStepCommit(ctx.context, planner, { next: 'wait', records: [], acknowledged: [] });
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  const reply = await writeTestTaskMessage(ctx.context, messaging, {
    from: 'conversation',
    to: 'planner',
    kind: 'reply',
    body: 'Tuesday is free.',
    replyTo: question.messageID,
    onBehalfOf: [],
    wake: true,
  });

  const tasks = await readTaskList(ctx.context, messaging, {
    callerID: 'conversation',
    state: 'all',
    limit: 20,
  });

  expect(reply).toMatchObject({ status: 'sent', woke: true });

  expect(tasks).toStrictEqual([
    {
      id: 'planner',
      name: 'Planner',
      state: 'ready',
      brief: 'Plans the week.',
      lastActivityAt: expect.toBeValidDate(),
    },
  ]);
});

test('it clears the wait when the task that asked finishes', async () => {
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

  await writeTestTaskMessage(ctx.context, messaging, {
    from: 'planner',
    to: 'conversation',
    kind: 'request',
    body: 'Ask about Tuesday.',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  await writeStepCommit(ctx.context, planner, { next: 'done', records: [], acknowledged: [] });

  const tasks = await readTaskList(ctx.context, messaging, {
    callerID: 'conversation',
    state: 'all',
    limit: 20,
  });

  expect(tasks).toStrictEqual([
    {
      id: 'planner',
      name: 'Planner',
      state: 'done',
      brief: 'Plans the week.',
      lastActivityAt: expect.toBeValidDate(),
    },
  ]);
});

test('it clears the wait when the asked task stops on its errors', async () => {
  const ctx = await setupTest();

  const messaging = {
    directory: [
      { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      { taskID: 'critic', name: 'Critic', brief: 'Checks plans.', isWokenByMessages: true },
    ],
    hopLimit: 20,
  };

  await createSystemTask(ctx.context, 'planner');
  await createSystemTask(ctx.context, 'critic');

  const planner = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(planner);

  await writeTestTaskMessage(ctx.context, messaging, {
    from: 'planner',
    to: 'critic',
    kind: 'question',
    body: 'Does this plan hold up?',
    replyTo: null,
    onBehalfOf: [],
    wake: true,
  });

  await writeStepCommit(ctx.context, planner, { next: 'wait', records: [], acknowledged: [] });

  const critic = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(critic);

  await writeStepError(ctx.context, critic, {
    error: new Error('the model refused the request'),
    maxStepErrors: 1,
    retryDelayMs: 30_000,
    maxRetryDelayMs: 300_000,
  });

  const tasks = await readTaskList(ctx.context, messaging, {
    callerID: 'critic',
    state: 'all',
    limit: 20,
  });

  expect(tasks).toStrictEqual([
    {
      id: 'planner',
      name: 'Planner',
      state: 'waiting',
      brief: 'Plans the week.',
      lastActivityAt: expect.toBeValidDate(),
    },
  ]);
});
