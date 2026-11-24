import { expect, test } from 'bun:test';
import { claimAction, runActionAttempt } from '@heynixie/actions';
import { readRecords, writeRecords } from '@heynixie/log';
import { registerFaultPointAction } from '@heynixie/memory/test-utils';
import {
  claimTask,
  createConversationTask,
  runTaskStep,
  writeStepCommit,
  writeTaskControl,
  writeTaskLimitRaise,
} from '@heynixie/tasks';
import { seedDefinitionTask, writeTestTriggerFire } from '@heynixie/tasks/test-utils';
import invariant from 'tiny-invariant';
import { buildSeeder } from '../test-utils/build-seeder';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';
import { defaultAPISettings } from '../utils/default-api-settings';

async function setupTest() {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  return {
    ...api,
    client: buildTestClient(api.url, laptop.token),
    seed: buildSeeder(api),

    // fires the definition's task and runs its task run through a step that reports, then waits
    reportDefinitionRun: async (taskID: string, definitionHash: string) => {
      await writeTestTriggerFire(api.context, taskID, {
        definitionHash,
        dedupeKey: `${taskID}|${crypto.randomUUID()}`,
      });

      const claim = await claimTask(api.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

      invariant(claim, 'the fire is ready to claim');

      await runTaskStep(api.context, claim, {
        runStep: (input) =>
          Promise.resolve({
            next: 'wait',
            records: [],
            acknowledged: input.inbox.map((record) => record.sequence),
            run: { activity: 'worked', report: { summary: 'Done.' } },
          }),
        leaseMs: 60_000,
        logger: () => {},
        maxStepErrors: 3,
        retryDelayMs: 30_000,
        maxRetryDelayMs: 300_000,
      });
    },
    writeMarkedTask: () =>
      writeRecords(api.context.log, [
        {
          kind: 'task.created',
          definitions: { snapshotHash: 'sha256:test' },
          thread: 'k3x9m2p7qa',
          payload: {
            taskID: 'k3x9m2p7qa',
            isConversation: false,
            state: 'waiting',
            startedBy: 'conversation',
            disposable: true,
          },
          erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
        },
      ]),
  };
}

test('#tasks.list lists the conversation and each started task with its name and brief', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  await writeRecords(api.context.log, [
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

  const listed = await client.tasks.list({});

  expect(listed.tasks).toIncludeSameMembers([
    {
      actions: { cancelled: 0, queued: 0, started: 0 },
      brief: 'Talks with the owner and answers each message.',
      controls: ['pause', 'resume', 'stop', 'restart', 'close', 'interrupt'],
      disposable: null,
      isPauseRequested: false,
      isPausedByNixie: false,
      isTakingMessages: true,
      lastActivityAt: expect.toBeValidDate(),
      listedState: expect.toBeString(),
      name: 'Conversation',
      runner: 'conversation',
      state: expect.toBeString(),
      taskID: 'conversation',
      wakeable: true,
    },
    {
      actions: { cancelled: 0, queued: 0, started: 0 },
      brief: 'Plan the beds.',
      controls: ['pause', 'resume', 'stop', 'restart', 'close', 'interrupt'],
      disposable: false,
      isPauseRequested: false,
      isPausedByNixie: false,
      isTakingMessages: true,
      lastActivityAt: expect.toBeValidDate(),
      listedState: 'idle',
      name: 'Garden plan',
      runner: 'sandbox',
      state: 'waiting',
      taskID: 'k3x9m2p7qa',
      wakeable: true,
    },
  ]);
});

test('#tasks.list gives the log sequence it read at', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  const [created] = await writeRecords(api.context.log, [
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

  invariant(created);

  const listed = await client.tasks.list({});

  expect(listed.readAtSequence).toBe(created.sequence);
});

test('#tasks.list gives a log sequence before a change that lands after its read of the tasks', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  registerFaultPointAction('task_list.read.after', () =>
    writeRecords(api.context.log, [
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
    ]),
  );

  const listed = await client.tasks.list({});
  const [landed] = await readRecords(api.context.log, { afterSequence: 0, thread: 'k3x9m2p7qa' });

  invariant(landed);

  expect(listed.tasks.map((task) => task.taskID)).toStrictEqual(['conversation']);
  expect(listed.readAtSequence).toBeLessThan(landed.record.sequence);
});

test('#tasks.list names the task that a task with an open question waits on', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  await writeRecords(api.context.log, [
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
        kind: 'question',
        replyTo: null,
        onBehalfOf: [],
        hop: 1,
        hopLimit: 20,
        wake: true,
        woke: true,
        opensWait: true,
        source: 'task:k3x9m2p7qa',
      },
      erasable: { body: 'Which bed gets the beans?' },
    },
  ]);

  const listed = await client.tasks.list({});

  expect(
    listed.tasks.map((task) => ({ taskID: task.taskID, waitingOn: task.waitingOn })),
  ).toIncludeSameMembers([
    { taskID: 'conversation', waitingOn: undefined },
    { taskID: 'k3x9m2p7qa', waitingOn: 'conversation' },
  ]);
});

test('#tasks.list counts a cancelled action apart from a queued one', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const firstStep = await ctx.seed.conversationStep();

  await ctx.seed.action({ step: firstStep.claim });

  await writeTaskControl(ctx.context, { taskID: 'conversation', control: 'stop' });
  await writeTaskControl(ctx.context, { taskID: 'conversation', control: 'restart' });

  const secondStep = await ctx.seed.conversationStep();

  await ctx.seed.action({ step: secondStep.claim, tool: 'test.archive' });

  const listed = await client.tasks.list({});

  expect(listed.tasks.find((task) => task.taskID === 'conversation')?.actions).toStrictEqual({
    cancelled: 1,
    queued: 1,
    started: 0,
  });
});

test('#tasks.read gives one task as the list gives it', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  await writeRecords(api.context.log, [
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

  const task = await client.tasks.read({ taskID: 'k3x9m2p7qa' });

  expect(task).toStrictEqual({
    actions: { cancelled: 0, queued: 0, started: 0 },
    brief: 'Plan the beds.',
    controls: ['pause', 'resume', 'stop', 'restart', 'close', 'interrupt'],
    disposable: false,
    isPauseRequested: false,
    isPausedByNixie: false,
    isTakingMessages: true,
    lastActivityAt: expect.toBeValidDate(),
    listedState: 'idle',
    name: 'Garden plan',
    runner: 'sandbox',
    state: 'waiting',
    taskID: 'k3x9m2p7qa',
    wakeable: true,
  });
});

test('#tasks.read gives a task that the list leaves out past its cap', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await writeRecords(
    api.context.log,
    Array.from({ length: 101 }, (_, index) => ({
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: `garden-${index}`,
      payload: {
        taskID: `garden-${index}`,
        isConversation: false,
        state: 'waiting',
        startedBy: 'conversation',
      },
      erasable: { name: `Garden bed ${index}`, brief: 'Plan one bed.' },
    })),
  );

  const listed = await client.tasks.list({});
  const oldest = await client.tasks.read({ taskID: 'garden-0' });

  expect(listed.tasks.map((task) => task.taskID)).not.toContain('garden-0');
  expect(oldest.name).toBe('Garden bed 0');
});

test('#tasks.read refuses a task that does not exist', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  expect(client.tasks.read({ taskID: 'k3x9m2p7qa' })).rejects.toMatchObject({
    code: 'TASK_NOT_FOUND',
  });
});

test('#tasks.read refuses a caller with no session', async () => {
  const api = await startTestAPI();

  const stranger = buildTestClient(api.url);

  await createConversationTask(api.context);

  expect(stranger.tasks.read({ taskID: 'conversation' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('#tasks.readActions lists the queued actions a stop would cancel and the started ones apart', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const client = buildTestClient(ctx.url, laptop.token);

  const step = await ctx.seed.conversationStep();
  const started = await ctx.seed.action({ step: step.claim, tool: 'test.archive' });
  const lease = await claimAction(ctx.context, { holder: 'runner-a', leaseMs: 60_000 });

  invariant(lease);

  await runActionAttempt(ctx.context, lease, {
    connectors: new Map([
      [
        'test.archive',
        { run: () => Promise.resolve({ kind: 'refused_retryable', reason: 'rate limited' }) },
      ],
    ]),
    leaseMs: 60_000,
  });

  const queued = await ctx.seed.action({ step: step.claim });
  const actions = await client.tasks.readActions({ taskID: 'conversation' });

  expect(actions).toStrictEqual({
    queued: [{ actionID: queued.action_id, tool: 'test.send' }],
    started: [{ actionID: started.action_id, tool: 'test.archive' }],
  });
});

test('#tasks.readActions refuses a task that does not exist', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  expect(client.tasks.readActions({ taskID: 'k3x9m2p7qa' })).rejects.toMatchObject({
    code: 'TASK_NOT_FOUND',
  });
});

test('#tasks.readActions refuses a caller with no session', async () => {
  const api = await startTestAPI();

  const stranger = buildTestClient(api.url);

  expect(stranger.tasks.readActions({ taskID: 'conversation' })).rejects.toMatchObject({
    code: 'UNAUTHORIZED',
  });
});

test('#tasks.list marks a task that runs on its own schedule as taking no message of yours', async () => {
  const api = await startTestAPI({
    ...defaultAPISettings,
    taskDirectory: [
      {
        taskID: 'sweeper',
        name: 'Sweeper',
        brief: 'Saves what you say as memory.',
        wakeable: false,
        speaker: 'plain_task',
      },
    ],
  });

  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await writeRecords(api.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'sweeper',
      payload: { taskID: 'sweeper', isConversation: false, state: 'waiting' },
    },
  ]);

  const listed = await client.tasks.list({});

  expect(listed.tasks.map((task) => [task.taskID, task.isTakingMessages])).toStrictEqual([
    ['sweeper', false],
  ]);
});

test('#tasks.read gives the next run of an asleep task and marks it not wakeable', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  const taskID = await seedDefinitionTask(
    { context: api.context, definitionStore: api.definitionStore, writer: api.writer },
    {
      definitionID: 'water-the-tomatoes',
      definitionHash: 'hash-1',
      version: { name: 'Water the tomatoes', brief: 'Water the beds.', wakeable: false },
    },
  );

  api.definitionStore.setNextFire('water-the-tomatoes', '2026-06-04T07:00:00.000Z');

  const listed = await client.tasks.read({ taskID });

  expect([listed.wakeable, listed.nextRunAt]).toStrictEqual([false, '2026-06-04T07:00:00.000Z']);
});

test('#tasks.list refuses a caller with no session', async () => {
  const api = await startTestAPI();

  const stranger = buildTestClient(api.url);

  expect(stranger.tasks.list({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#tasks.pause pauses a waiting task and records the pause', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  const paused = await client.tasks.pause({
    clientActionID: '2c4e6a8b-1d3f-4b5c-8e7a-9f0b1c2d3e4f',
    taskID: 'conversation',
  });

  const records = await readRecords(api.context.log, { afterSequence: 0, thread: 'conversation' });

  expect(paused).toStrictEqual({
    controlledAt: new Date(1_000_000),
    isPauseRequested: false,
    state: 'paused',
    taskID: 'conversation',
  });

  expect(records.at(-1)?.record).toMatchObject({
    kind: 'task.paused',
    payload: { taskID: 'conversation', resumeState: 'waiting' },
  });
});

test('#tasks.resume answers a repeat of the same action with the first result, and resumes once', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  await client.tasks.pause({
    clientActionID: '2c4e6a8b-1d3f-4b5c-8e7a-9f0b1c2d3e4f',
    taskID: 'conversation',
  });

  const first = await client.tasks.resume({
    clientActionID: '3d5f7b9c-2e4a-4c6d-9f8b-0a1c2d3e4f5a',
    taskID: 'conversation',
  });

  const repeat = await client.tasks.resume({
    clientActionID: '3d5f7b9c-2e4a-4c6d-9f8b-0a1c2d3e4f5a',
    taskID: 'conversation',
  });

  const records = await readRecords(api.context.log, { afterSequence: 0, thread: 'conversation' });

  expect(repeat).toStrictEqual(first);
  expect(records.filter((entry) => entry.record.kind === 'task.resumed')).toHaveLength(1);
});

test('#tasks.stop refuses a client action ID that another control used', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  await client.tasks.pause({
    clientActionID: '2c4e6a8b-1d3f-4b5c-8e7a-9f0b1c2d3e4f',
    taskID: 'conversation',
  });

  expect(
    client.tasks.stop({
      clientActionID: '2c4e6a8b-1d3f-4b5c-8e7a-9f0b1c2d3e4f',
      taskID: 'conversation',
    }),
  ).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test('#tasks.restart refuses a task whose state takes no restart, with the state', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  expect(
    client.tasks.restart({
      clientActionID: '4e6a8c0d-3f5b-4d7e-8a9c-1b2d3e4f5a6b',
      taskID: 'conversation',
    }),
  ).rejects.toMatchObject({
    code: 'TASK_STATE_REFUSED',
    data: { isPauseRequested: false, state: 'waiting' },
  });
});

test('#tasks.interrupt refuses a task that does not exist', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  expect(
    client.tasks.interrupt({
      clientActionID: '5f7b9d1e-4a6c-4e8f-9b0d-2c3e4f5a6b7c',
      taskID: 'k3x9m2p7qa',
    }),
  ).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
});

test('#tasks.close closes a started task', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await writeRecords(api.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: { taskID: 'k3x9m2p7qa', isConversation: false, state: 'waiting' },
      erasable: { name: 'Garden plan', brief: 'Plan the beds.' },
    },
  ]);

  const closed = await client.tasks.close({
    clientActionID: '6a8c0e2f-5b7d-4f9a-8c1e-3d4f5a6b7c8d',
    taskID: 'k3x9m2p7qa',
  });

  expect(closed.state).toBe('closed');
});

test('#tasks.close refuses to close the conversation', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  expect(
    client.tasks.close({
      clientActionID: '7b9d1f3a-6c8e-4a0b-9d2f-4e5a6b7c8d9e',
      taskID: 'conversation',
    }),
  ).rejects.toMatchObject({ code: 'CONVERSATION_NEVER_CLOSES' });
});

test('#tasks.close refuses to close the task of a definition', async () => {
  const api = await startTestAPI();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await writeRecords(api.context.log, [
    {
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'w4t7r2n9ka',
      payload: { taskID: 'w4t7r2n9ka', isConversation: false, state: 'waiting' },
    },
    {
      kind: 'task.definition_set',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'w4t7r2n9ka',
      payload: {
        taskID: 'w4t7r2n9ka',
        definitionID: 'water-the-tomatoes',
        definitionHash: 'hash-1',
      },
    },
  ]);

  expect(
    client.tasks.close({
      clientActionID: '7b9d1f3a-6c8e-4a0b-9d2f-4e5a6b7c8d9f',
      taskID: 'w4t7r2n9ka',
    }),
  ).rejects.toMatchObject({ code: 'DEFINITION_TASK_NEVER_CLOSES' });
});

test('#tasks.pause refuses a caller with no session', async () => {
  const api = await startTestAPI();

  const stranger = buildTestClient(api.url);

  expect(
    stranger.tasks.pause({
      clientActionID: '8c0e2a4b-7d9f-4b1c-8e3a-5f6b7c8d9e0f',
      taskID: 'conversation',
    }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#tasks.list gives the mark of a started task and who closed a closed one', async () => {
  const api = await setupTest();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await api.writeMarkedTask();

  const marked = await client.tasks.read({ taskID: 'k3x9m2p7qa' });

  await writeRecords(api.context.log, [
    {
      kind: 'task.closed',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'k3x9m2p7qa',
      payload: { taskID: 'k3x9m2p7qa', stepKey: null, timerIDs: [], closedBy: 'disposable' },
    },
  ]);

  const closed = await client.tasks.read({ taskID: 'k3x9m2p7qa' });

  expect(marked).toMatchObject({ disposable: true, state: 'waiting' });
  expect(marked).not.toHaveProperty('closedBy');
  expect(closed).toMatchObject({ disposable: true, state: 'closed', closedBy: 'disposable' });
});

test('#tasks.setDisposable changes the mark and records the change on the task', async () => {
  const api = await setupTest();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await api.writeMarkedTask();

  const changed = await client.tasks.setDisposable({
    clientActionID: '1a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d',
    taskID: 'k3x9m2p7qa',
    disposable: false,
  });

  const read = await client.tasks.read({ taskID: 'k3x9m2p7qa' });

  const entries = await readRecords(api.context.log, {
    afterSequence: 0,
    kinds: ['task.mark_set'],
  });

  expect(changed).toStrictEqual({
    changedAt: expect.toBeValidDate(),
    disposable: false,
    taskID: 'k3x9m2p7qa',
  });

  expect(read.disposable).toBe(false);
  expect(read.state).toBe('waiting');

  expect(entries.map((entry) => entry.record.payload)).toStrictEqual([
    { taskID: 'k3x9m2p7qa', disposable: false },
  ]);
});

test('#tasks.setDisposable answers a repeat of the same action with the first result, and records once', async () => {
  const api = await setupTest();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await api.writeMarkedTask();

  const input = {
    clientActionID: '2b3c4d5e-6f7a-4b8c-9d0e-1f2a3b4c5d6e',
    taskID: 'k3x9m2p7qa',
    disposable: false,
  };

  const first = await client.tasks.setDisposable(input);
  const second = await client.tasks.setDisposable(input);

  const entries = await readRecords(api.context.log, {
    afterSequence: 0,
    kinds: ['task.mark_set'],
  });

  expect(second).toStrictEqual(first);
  expect(entries).toHaveLength(1);
});

test('#tasks.setDisposable refuses a client action ID that another change used', async () => {
  const api = await setupTest();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await api.writeMarkedTask();

  await client.tasks.setDisposable({
    clientActionID: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
    taskID: 'k3x9m2p7qa',
    disposable: false,
  });

  expect(
    client.tasks.setDisposable({
      clientActionID: '3c4d5e6f-7a8b-4c9d-8e1f-2a3b4c5d6e7f',
      taskID: 'k3x9m2p7qa',
      disposable: true,
    }),
  ).rejects.toMatchObject({ code: 'CLIENT_ACTION_ID_REUSED' });
});

test('#tasks.setDisposable refuses a task that does not exist', async () => {
  const api = await setupTest();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  expect(
    client.tasks.setDisposable({
      clientActionID: '4d5e6f7a-8b9c-4d0e-9f2a-3b4c5d6e7f80',
      taskID: 'nosuchtask',
      disposable: true,
    }),
  ).rejects.toMatchObject({ code: 'TASK_NOT_FOUND' });
});

test('#tasks.setDisposable refuses the conversation, which has no mark', async () => {
  const api = await setupTest();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await createConversationTask(api.context);

  expect(
    client.tasks.setDisposable({
      clientActionID: '5e6f7a8b-9c0d-4e1f-8a3b-4c5d6e7f8091',
      taskID: 'conversation',
      disposable: true,
    }),
  ).rejects.toMatchObject({ code: 'TASK_HAS_NO_MARK' });
});

test('#tasks.setDisposable refuses a closed task, with its state, and writes nothing', async () => {
  const api = await setupTest();
  const laptop = await createDeviceSession(api.context, 'laptop');

  const client = buildTestClient(api.url, laptop.token);

  await api.writeMarkedTask();

  await client.tasks.close({
    clientActionID: '6f7a8b9c-0d1e-4f2a-9b4c-5d6e7f8091a2',
    taskID: 'k3x9m2p7qa',
  });

  expect(
    client.tasks.setDisposable({
      clientActionID: '7a8b9c0d-1e2f-4a3b-8c5d-6e7f8091a2b3',
      taskID: 'k3x9m2p7qa',
      disposable: false,
    }),
  ).rejects.toMatchObject({ code: 'TASK_STATE_REFUSED', data: { state: 'closed' } });

  const entries = await readRecords(api.context.log, {
    afterSequence: 0,
    kinds: ['task.mark_set'],
  });

  expect(entries).toStrictEqual([]);
});

test('#tasks.setDisposable refuses a caller with no session', async () => {
  const api = await setupTest();

  const stranger = buildTestClient(api.url);

  expect(
    stranger.tasks.setDisposable({
      clientActionID: '8b9c0d1e-2f3a-4b4c-9d6e-7f8091a2b3c4',
      taskID: 'k3x9m2p7qa',
      disposable: true,
    }),
  ).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});

test('#tasks.list gives each task its listed state, and idle, finished and asleep apart', async () => {
  const ctx = await setupTest();
  const step = await ctx.seed.conversationStep();
  const running = await ctx.seed.runningTask({ starter: step.claim, name: 'Run', brief: 'Runs.' });
  const idle = await ctx.seed.waitingTask({ starter: step.claim, name: 'Idle', brief: 'Idles.' });

  const finished = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
    version: { wakeable: true },
    policy: { wakeable: true },
  });

  const asleep = await seedDefinitionTask(ctx, {
    definitionID: 'prune-the-roses',
    definitionHash: 'hash-2',
    version: { wakeable: false },
    policy: { wakeable: false },
  });

  await ctx.reportDefinitionRun(finished, 'hash-1');
  await ctx.reportDefinitionRun(asleep, 'hash-2');

  const listed = await ctx.client.tasks.list({});

  expect(
    listed.tasks.map((task) => [task.taskID, task.state, task.listedState]),
  ).toIncludeAllMembers([
    [running, 'running', 'running'],
    [idle, 'waiting', 'idle'],
    [finished, 'waiting', 'finished'],
    [asleep, 'waiting', 'asleep'],
  ]);
});

test('#tasks.list lists every task that nixie holds as paused, and keeps the stored state and an exempt task', async () => {
  const ctx = await setupTest();
  const step = await ctx.seed.conversationStep();

  const waiting = await ctx.seed.waitingTask({
    starter: step.claim,
    name: 'Wait',
    brief: 'Waits.',
  });

  const exempt = await ctx.seed.waitingTask({ starter: step.claim, name: 'Keep', brief: 'Keeps.' });

  const stopped = await ctx.seed.stoppedTask({
    starter: step.claim,
    name: 'Stop',
    brief: 'Stops.',
  });

  await createConversationTask(ctx.context);

  await ctx.client.nixie.pause({ clientActionID: '4b2d6f8a-1c3e-4a5b-9d7f-0e2c4a6b8d1f' });

  await ctx.client.tasks.resume({
    taskID: exempt,
    clientActionID: '7c1e3a5b-9d2f-4b6a-8e0c-2f4a6b8d1c3e',
  });

  const listed = await ctx.client.tasks.list({});

  expect(
    listed.tasks.map((task) => [task.taskID, task.state, task.listedState]),
  ).toIncludeAllMembers([
    ['conversation', expect.toBeString(), 'paused'],
    [waiting, 'waiting', 'paused'],
    [exempt, 'waiting', 'idle'],
    [stopped, 'stopped', 'stopped'],
  ]);
});

test('#tasks.list gives a trigger task run its fire, with a catch-up marked', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await writeTestTriggerFire(ctx.context, taskID, {
    definitionHash: 'hash-1',
    scheduledFor: '2027-03-11T21:00:00.000Z',
    firedAt: '2027-03-11T21:20:00.000Z',
    isCatchUp: true,
  });

  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  const task = await ctx.client.tasks.read({ taskID });

  expect([task.definitionID, task.fire]).toStrictEqual([
    'water-the-tomatoes',
    {
      scheduledFor: '2027-03-11T21:00:00.000Z',
      firedAt: '2027-03-11T21:20:00.000Z',
      isCatchUp: true,
    },
  ]);
});

test('#tasks.list gives a task run that a limit raise carries the fire of its first task run', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await writeTestTriggerFire(ctx.context, taskID, {
    definitionHash: 'hash-1',
    scheduledFor: '2027-03-11T21:00:00.000Z',
    firedAt: '2027-03-11T21:00:00.000Z',
  });

  const claim = await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  invariant(claim, 'the fire is ready to claim');

  await writeStepCommit(ctx.context, claim, {
    next: 'continue',
    records: [],
    acknowledged: [],
    run: { activity: 'worked', limit: { meter: 'turns', used: 3, limit: 3 } },
  });

  await writeTaskLimitRaise(ctx.context, { taskID, limits: { turns: 6 } });
  await claimTask(ctx.context, { holder: 'runner-a', leaseMs: 60_000, taskID });

  const task = await ctx.client.tasks.read({ taskID });

  expect(task.fire).toStrictEqual({
    scheduledFor: '2027-03-11T21:00:00.000Z',
    firedAt: '2027-03-11T21:00:00.000Z',
    isCatchUp: false,
  });
});

test('#tasks.list gives a definition task whose task run no fire opened a null fire, and a started task none', async () => {
  const ctx = await setupTest();
  const step = await ctx.seed.conversationStep();

  const started = await ctx.seed.waitingTask({
    starter: step.claim,
    name: 'Wait',
    brief: 'Waits.',
  });

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  const listed = await ctx.client.tasks.list({});

  expect(listed.tasks.find((task) => task.taskID === taskID)?.fire).toBeNull();
  expect(listed.tasks.find((task) => task.taskID === started)).not.toHaveProperty('fire');
});

test('#tasks.list finds a task of a definition past the cap when it filters by the definition', async () => {
  const ctx = await setupTest();

  const taskID = await seedDefinitionTask(ctx, {
    definitionID: 'water-the-tomatoes',
    definitionHash: 'hash-1',
  });

  await writeRecords(
    ctx.context.log,
    Array.from({ length: 101 }, (_, index) => ({
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: `garden-${index}`,
      payload: {
        taskID: `garden-${index}`,
        isConversation: false,
        state: 'waiting',
        startedBy: 'conversation',
      },
      erasable: { name: `Garden bed ${index}`, brief: 'Plan one bed.' },
    })),
  );

  const unfiltered = await ctx.client.tasks.list({});
  const filtered = await ctx.client.tasks.list({ definitionID: 'water-the-tomatoes' });

  expect(unfiltered.tasks.map((task) => task.taskID)).not.toContain(taskID);
  expect(filtered.tasks.map((task) => task.taskID)).toStrictEqual([taskID]);
});

test('#tasks.list finds a task in a state past the cap when it filters by the state', async () => {
  const ctx = await setupTest();
  const step = await ctx.seed.conversationStep();

  const stopped = await ctx.seed.stoppedTask({
    starter: step.claim,
    name: 'Stop',
    brief: 'Stops.',
  });

  await writeRecords(
    ctx.context.log,
    Array.from({ length: 101 }, (_, index) => ({
      kind: 'task.created',
      definitions: { snapshotHash: 'sha256:test' },
      thread: `garden-${index}`,
      payload: {
        taskID: `garden-${index}`,
        isConversation: false,
        state: 'waiting',
        startedBy: 'conversation',
      },
      erasable: { name: `Garden bed ${index}`, brief: 'Plan one bed.' },
    })),
  );

  const unfiltered = await ctx.client.tasks.list({});
  const filtered = await ctx.client.tasks.list({ states: ['stopped', 'failed'] });

  expect(unfiltered.tasks.map((task) => task.taskID)).not.toContain(stopped);
  expect(filtered.tasks.map((task) => task.taskID)).toStrictEqual([stopped]);
});

test('#tasks.list answers a call with no input as it answers an empty input', async () => {
  const ctx = await setupTest();
  const withNone = await ctx.client.tasks.list();
  const withEmpty = await ctx.client.tasks.list({});

  expect(withNone.tasks).toStrictEqual(withEmpty.tasks);
});
