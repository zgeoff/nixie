import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { claimTask } from './claim-task';
import { createConversationTask } from './create-conversation-task';
import { createSystemTask } from './create-system-task';
import { readTaskList } from './read-task-list';
import { seedConversationStep } from './test-utils/seed-conversation-step';
import { seedStartedTask } from './test-utils/seed-started-task';
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
    { callerID: 'conversation', limit: 20 },
  );

  expect(tasks).toStrictEqual([
    {
      id: 'critic',
      name: 'Critic',
      state: 'ready',
      brief: 'Checks plans.',
      isPauseRequested: false,
      lastActivityAt: expect.toBeValidDate(),
      model: null,
      lastSentKind: null,
    },
    {
      id: 'planner',
      name: 'Planner',
      state: 'ready',
      brief: 'Plans the week.',
      isPauseRequested: false,
      lastActivityAt: expect.toBeValidDate(),
      model: null,
      lastSentKind: null,
    },
  ]);
});

test.each([
  ['holds only the caller', 'planner'],
  ['holds no task that exists', 'conversation'],
])('it lists no task for a directory that %s', async (_case, callerID) => {
  const ctx = await setupTest();

  await createSystemTask(ctx.context, 'critic');

  const tasks = await readTaskList(
    ctx.context,
    {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
      ],
    },
    { callerID, limit: 20 },
  );

  expect(tasks).toStrictEqual([]);
});

test('it lists each task with the model it started on and the kind of the last message it sent', async () => {
  const ctx = await setupTest();
  const starter = await seedConversationStep(ctx.context);

  const messaging = {
    directory: [
      { taskID: 'conversation', name: 'Conversation', brief: 'Talks.', isWokenByMessages: true },
    ],
    hopLimit: 20,
  };

  const taskID = await seedStartedTask(ctx.context, {
    starter: starter.claim,
    name: 'Second look',
    brief: 'Find the weak points in the plan.',
    options: { model: 'second-look', profile: 'router-b' },
  });

  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  await writeTestTaskMessage(ctx.context, messaging, {
    from: taskID,
    to: 'conversation',
    kind: 'progress',
    body: 'Two beds get too little sun.',
    replyTo: null,
    onBehalfOf: [],
    wake: false,
  });

  const tasks = await readTaskList(
    ctx.context,
    {
      directory: [
        { taskID, name: 'Second look', brief: 'Find the weak points.', isWokenByMessages: true },
      ],
    },
    { callerID: 'conversation', limit: 20 },
  );

  expect(tasks).toStrictEqual([
    {
      id: taskID,
      name: 'Second look',
      state: 'running',
      brief: 'Find the weak points.',
      isPauseRequested: false,
      lastActivityAt: expect.toBeValidDate(),
      model: 'second-look',
      lastSentKind: 'progress',
    },
  ]);
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
    limit: 20,
  });

  expect(tasks).toStrictEqual([
    {
      id: 'planner',
      name: 'Planner',
      state: 'running',
      brief: 'Plans the week.',
      isPauseRequested: false,
      lastActivityAt: expect.toBeValidDate(),
      model: null,
      lastSentKind: 'question',
      waitingOn: 'conversation',
    },
  ]);
});

test.each(['question', 'request'] as const)(
  'it shows no wait for a task that sent a %s to the memory writer, which runs on its own schedule',
  async (kind) => {
    const ctx = await setupTest();

    const messaging = {
      directory: [
        { taskID: 'planner', name: 'Planner', brief: 'Plans the week.', isWokenByMessages: true },
        {
          taskID: 'memory-writer',
          name: 'Memory writer',
          brief: 'Saves memory.',
          isWokenByMessages: false,
        },
      ],
      hopLimit: 20,
    };

    await createSystemTask(ctx.context, 'planner');
    await createSystemTask(ctx.context, 'memory-writer');
    await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

    const outcome = await writeTestTaskMessage(ctx.context, messaging, {
      from: 'planner',
      to: 'memory-writer',
      kind,
      body: 'Keep the note about the allotment.',
      replyTo: null,
      onBehalfOf: [],
      wake: true,
    });

    const tasks = await readTaskList(ctx.context, messaging, {
      callerID: 'memory-writer',
      limit: 20,
    });

    expect(outcome).toStrictEqual({
      status: 'sent',
      messageID: expect.toBeString(),
      hop: 1,
      woke: false,
      hold: 'next_run',
    });

    expect(tasks).toStrictEqual([
      {
        id: 'planner',
        name: 'Planner',
        state: 'running',
        brief: 'Plans the week.',
        isPauseRequested: false,
        lastActivityAt: expect.toBeValidDate(),
        model: null,
        lastSentKind: kind,
      },
    ]);
  },
);

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
    limit: 20,
  });

  expect(reply).toStrictEqual({
    status: 'sent',
    messageID: expect.toBeString(),
    hop: 2,
    woke: true,
    hold: 'none',
  });

  expect(tasks).toStrictEqual([
    {
      id: 'planner',
      name: 'Planner',
      state: 'ready',
      brief: 'Plans the week.',
      isPauseRequested: false,
      lastActivityAt: expect.toBeValidDate(),
      model: null,
      lastSentKind: 'question',
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
    limit: 20,
  });

  expect(tasks).toStrictEqual([
    {
      id: 'planner',
      name: 'Planner',
      state: 'done',
      brief: 'Plans the week.',
      isPauseRequested: false,
      lastActivityAt: expect.toBeValidDate(),
      model: null,
      lastSentKind: 'request',
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
    limit: 20,
  });

  expect(tasks).toStrictEqual([
    {
      id: 'planner',
      name: 'Planner',
      state: 'waiting',
      brief: 'Plans the week.',
      isPauseRequested: false,
      lastActivityAt: expect.toBeValidDate(),
      model: null,
      lastSentKind: 'question',
    },
  ]);
});
