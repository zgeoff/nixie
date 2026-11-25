import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { removeTestRecordKey } from '@heynixie/log/test-utils';
import type { RunStep, TasksTables } from '@heynixie/tasks';
import { claimTask, runTaskStep, writeInboxRecords } from '@heynixie/tasks';
import { writeTestTaskMessage } from '@heynixie/tasks/test-utils';
import { deliverTriggerBatch } from '@heynixie/triggers';
import invariant from 'tiny-invariant';
import { readBinding } from '../session/read-binding';
import { readOpenBindings } from '../session/read-open-bindings';
import { collectTaskInputs } from '../source/collect-task-inputs';
import { startTestCoding } from '../test-utils/start-test-coding';
import type { SessionEvent } from '../types';
import { makeCodingStep } from './make-coding-step';

async function setupTest() {
  const ctx = await startTestCoding();
  const claim = await ctx.claimConversation();

  const startSession = async (input: object = {}): Promise<string> => {
    const taskID = await ctx.startTask(claim, {
      name: 'Fix the flaky login test',
      brief: 'Find why the login test fails.',
      repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
      ...input,
    });

    await ctx.runActions();
    await ctx.runSteps();

    return taskID;
  };

  return {
    ...ctx,
    claim,
    seed: { session: startSession },
    deliver: async (taskID: string, events: readonly SessionEvent[]) => {
      const binding = await readBinding(ctx.log.writer.db, taskID);

      const entries: [string, NonNullable<typeof binding>][] = [];

      if (binding !== null) {
        entries.push([binding.sessionID, binding]);
      }

      const bindings = new Map(entries);

      await deliverTriggerBatch(ctx.core, 'coding:atc', {
        cursor: 'c1',
        events: collectTaskInputs(events, bindings),
      });
    },
    sendFromConversation: (taskID: string, body: string) =>
      writeTestTaskMessage(
        ctx.context,
        {
          hopLimit: 6,
          directory: [
            { taskID, name: 'Login fix', brief: '', wakeable: true, speaker: 'plain_task' },
          ],
        },
        {
          from: 'conversation',
          to: taskID,
          kind: 'request',
          body,
          replyTo: null,
          onBehalfOf: [],
          wake: true,
        },
      ),
    sendFromUser: (taskID: string, text: string) =>
      writeInboxRecords(ctx.context, [
        {
          kind: 'owner_message',
          definitions: ctx.context.definitions(),
          thread: taskID,
          payload: { identityID: 'owner', spans: 'as_sent' },
          erasable: { text },
        },
      ]),
    readMessagesTo: async (thread: string) => {
      const entries = await readRecords(ctx.log, {
        afterSequence: 0,
        thread,
        kinds: ['task_message'],
      });

      return entries.map((entry) => ({
        from: entry.record.payload['from'],
        kind: entry.record.payload['kind'],
        hop: entry.record.payload['hop'],
        replyTo: entry.record.payload['replyTo'],
        outside: entry.record.payload['outside'] ?? false,
        body:
          entry.record.erasable.status === 'readable' ? entry.record.erasable.fields['body'] : null,
      }));
    },
    readTaskState: async (taskID: string) => {
      const row = await ctx.log.writer.db
        .$extendTables<TasksTables>()
        .selectFrom('tasks')
        .select('state')
        .where('task_id', '=', taskID)
        .executeTakeFirstOrThrow();

      return row.state;
    },

    // runs one step of the coding task, which first runs the callback: work that commits after the
    // step read its inbox
    runStepAfter: async (taskID: string, before: () => Promise<unknown>) => {
      const codingStep = makeCodingStep(ctx.coding, ctx.adapter);

      const runStep: RunStep = async (input) => {
        await before();

        return codingStep(input);
      };

      const taskClaim = await claimTask(ctx.context, {
        holder: 'runner-a',
        leaseMs: 60_000,
        taskID,
      });

      invariant(taskClaim, 'the coding task is ready to claim');

      await runTaskStep(ctx.context, taskClaim, {
        runStep,
        leaseMs: 60_000,
        logger: () => {},
        maxStepErrors: 3,
        retryDelayMs: 30_000,
        maxRetryDelayMs: 300_000,
      });
    },

    // runs one step of the coding task, which runs the callback after the step read what it needs and
    // before its commit: work that commits between the step's reads and its commit
    runStepThen: async (taskID: string, after: () => Promise<unknown>) => {
      const codingStep = makeCodingStep(ctx.coding, ctx.adapter);

      const runStep: RunStep = async (input) => {
        const result = await codingStep(input);

        await after();

        return result;
      };

      const taskClaim = await claimTask(ctx.context, {
        holder: 'runner-a',
        leaseMs: 60_000,
        taskID,
      });

      invariant(taskClaim, 'the coding task is ready to claim');

      await runTaskStep(ctx.context, taskClaim, {
        runStep,
        leaseMs: 60_000,
        logger: () => {},
        maxStepErrors: 3,
        retryDelayMs: 30_000,
        maxRetryDelayMs: 300_000,
      });
    },
    forgetEvents: async (taskID: string) => {
      const entries = await readRecords(ctx.log, {
        afterSequence: 0,
        thread: taskID,
        kinds: ['trigger.task_input'],
      });

      for (const entry of entries) {
        await removeTestRecordKey(ctx.log, entry.record.sequence);
      }
    },
    listSession: async () => {
      const listed = await ctx.callTool(claim, 'coding.sessions', {});

      return /"id":"(?<id>[^"]+)"/u.exec(JSON.stringify(listed.outcome))?.groups?.['id'] ?? '';
    },
    readBinding: (taskID: string) => readBinding(ctx.log.writer.db, taskID),
    readOwners: (sessionID: string) => readOpenBindings(ctx.log.writer.db, 'atc', [sessionID]),
    readEventKeys: async (taskID: string) => {
      const entries = await readRecords(ctx.log, {
        afterSequence: 0,
        thread: taskID,
        kinds: ['trigger.task_input'],
      });

      return entries.map((entry) => entry.record.payload['dedupeKey']);
    },
  };
}

test('it forwards a state in the wake set to the report target, and lands a state outside it on the thread only', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session({ wake: ['waiting'] });

  await ctx.deliver(taskID, [
    {
      session: 'cloud.3f9a1c2e.00000001',
      eventKey: 'cloud|1',
      at: '2027-03-09T10:00:00.000Z',
      kind: 'state',
      state: 'idle',
      question: null,
    },
    {
      session: 'cloud.3f9a1c2e.00000001',
      eventKey: 'cloud|2',
      at: '2027-03-09T10:00:00.000Z',
      kind: 'state',
      state: 'waiting',
      question: 'Which branch should the fix go on?',
    },
  ]);

  await ctx.runSteps();

  expect({
    messages: await ctx.readMessagesTo('conversation'),
    events: await ctx.readEventKeys(taskID),
  }).toStrictEqual({
    messages: [
      {
        from: taskID,
        kind: 'progress',
        hop: 1,
        replyTo: null,
        outside: true,
        body: 'The coding session is now waiting. It asks: Which branch should the fix go on?',
      },
    ],
    events: ['cloud|1', 'cloud|2'],
  });
});

test('it lands an event that two reads deliver on the thread once', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session();

  const event: SessionEvent = {
    session: 'cloud.3f9a1c2e.00000001',
    eventKey: 'cloud|1',
    at: '2027-03-09T10:00:00.000Z',
    kind: 'state',
    state: 'idle',
    question: null,
  };

  await ctx.deliver(taskID, [event]);
  await ctx.deliver(taskID, [event]);
  await ctx.runSteps();

  expect({
    messages: await ctx.readMessagesTo('conversation'),
    events: await ctx.readEventKeys(taskID),
  }).toStrictEqual({
    messages: [
      {
        from: taskID,
        kind: 'progress',
        hop: 1,
        replyTo: null,
        outside: false,
        body: 'The coding session is now idle.',
      },
    ],
    events: ['cloud|1'],
  });
});

test('it forwards a note whose label the wake set holds, and drops one it does not', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session({ wake: ['blocked'] });

  await ctx.deliver(taskID, [
    {
      session: 'cloud.3f9a1c2e.00000001',
      eventKey: 'cloud|1',
      at: '2027-03-09T10:00:00.000Z',
      kind: 'note',
      label: 'progress',
      text: 'Tests pass.',
    },
    {
      session: 'cloud.3f9a1c2e.00000001',
      eventKey: 'cloud|2',
      at: '2027-03-09T10:00:00.000Z',
      kind: 'note',
      label: 'blocked',
      text: 'The CI secrets are missing.',
    },
  ]);

  await ctx.runSteps();

  const messages = await ctx.readMessagesTo('conversation');

  expect(messages).toStrictEqual([
    {
      from: taskID,
      kind: 'progress',
      hop: 1,
      replyTo: null,
      outside: true,
      body: 'The coding session sent a blocked note: The CI secrets are missing.',
    },
  ]);
});

test('it ends the task as done with the last reply as its report when the session ends', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session({ wake: ['ended'] });

  ctx.adapter.addSession({
    id: 'cloud.3f9a1c2e.00000001',
    state: 'ended',
    lastReply: 'I opened a pull request that fixes the cookie expiry.',
  });

  await ctx.deliver(taskID, [
    {
      session: 'cloud.3f9a1c2e.00000001',
      eventKey: 'cloud|1',
      at: '2027-03-09T10:00:00.000Z',
      kind: 'state',
      state: 'ended',
      question: null,
    },
  ]);

  await ctx.runSteps();

  const reports = await readRecords(ctx.log, {
    afterSequence: 0,
    thread: taskID,
    kinds: ['task.run_ended'],
  });

  expect({
    state: await ctx.readTaskState(taskID),
    messages: await ctx.readMessagesTo('conversation'),
    reports: reports.map((entry) => entry.record.erasable),
  }).toStrictEqual({
    state: 'done',
    messages: [
      {
        from: taskID,
        kind: 'progress',
        hop: 1,
        replyTo: null,
        outside: false,
        body: 'The coding session is now ended.',
      },
      {
        from: taskID,
        kind: 'report',
        hop: 1,
        replyTo: null,
        outside: true,
        body: 'report:\n  summary: I opened a pull request that fixes the cookie expiry.',
      },
    ],
    reports: [
      {
        status: 'readable',
        fields: {
          body: 'report:\n  summary: I opened a pull request that fixes the cookie expiry.',
        },
      },
    ],
  });
});

test('it ends the task with the fallback summary, and sends no progress, when the session ends outside the wake set and its read fails', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session({ wake: [] });

  ctx.adapter.replyNext('read', { status: 'refused', canClear: true, reason: 'host_unavailable' });

  await ctx.deliver(taskID, [
    {
      session: 'cloud.3f9a1c2e.00000001',
      eventKey: 'cloud|1',
      at: '2027-03-09T10:00:00.000Z',
      kind: 'state',
      state: 'ended',
      question: null,
    },
  ]);

  await ctx.runSteps();

  const reports = await readRecords(ctx.log, {
    afterSequence: 0,
    thread: taskID,
    kinds: ['task.run_ended'],
  });

  const messages = await ctx.readMessagesTo('conversation');

  expect({
    state: await ctx.readTaskState(taskID),
    kinds: messages.map((message) => message.kind),
    reports: reports.map((entry) => entry.record.erasable),
  }).toStrictEqual({
    state: 'done',
    kinds: ['report'],
    reports: [
      {
        status: 'readable',
        fields: {
          body: 'report:\n  summary: "The session ended, and nixie could not read its final reply."',
        },
      },
    ],
  });
});

test('it sends a message to the task as a note under the action key, and replies to the sender with the answer', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session();
  const sent = await ctx.sendFromConversation(taskID, 'Is the retry count still 3?');

  const messageID = sent.status === 'sent' ? sent.messageID : '';

  await ctx.runSteps();
  await ctx.runActions();
  await ctx.runSteps();

  await ctx.deliver(taskID, [
    {
      session: 'cloud.3f9a1c2e.00000001',
      eventKey: 'cloud|1',
      at: '2027-03-09T10:00:00.000Z',
      kind: 'answered',
      messageRef: 'note-1',
      answer: 'It is 5 now.',
    },
  ]);

  await ctx.runSteps();

  const note = ctx.adapter.calls.find((call) => call.method === 'message');

  const messages = await ctx.readMessagesTo('conversation');

  expect({
    note,
    replies: messages.filter((message) => message.kind === 'reply'),
  }).toStrictEqual({
    note: {
      method: 'message',
      session: 'cloud.3f9a1c2e.00000001',
      idempotencyKey: expect.any(String),
      text: 'Is the retry count still 3?',
    },
    replies: [
      {
        from: taskID,
        kind: 'reply',
        hop: 2,
        replyTo: messageID,
        outside: true,
        body: 'The coding session answered: It is 5 now.',
      },
    ],
  });
});

test('it holds an answer that arrives before its note is done, and replies once the note is done', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session();
  const sent = await ctx.sendFromConversation(taskID, 'Is the retry count still 3?');

  const messageID = sent.status === 'sent' ? sent.messageID : '';

  await ctx.runSteps();

  await ctx.deliver(taskID, [
    {
      session: 'cloud.3f9a1c2e.00000001',
      eventKey: 'cloud|1',
      at: '2027-03-09T10:00:00.000Z',
      kind: 'answered',
      messageRef: 'note-1',
      answer: 'It is 5 now.',
    },
  ]);

  await ctx.runSteps();
  await ctx.runActions();
  await ctx.runSteps();

  const messages = await ctx.readMessagesTo('conversation');
  const binding = await readBinding(ctx.log.writer.db, taskID);

  expect({
    replies: messages.filter((message) => message.kind === 'reply'),
    held: binding?.heldAnswers,
  }).toStrictEqual({
    replies: [
      {
        from: taskID,
        kind: 'reply',
        hop: 2,
        replyTo: messageID,
        outside: true,
        body: 'The coding session answered: It is 5 now.',
      },
    ],
    held: [],
  });
});

test('it drops an answer to a note that nixie never sent', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session();

  await ctx.deliver(taskID, [
    {
      session: 'cloud.3f9a1c2e.00000001',
      eventKey: 'cloud|1',
      at: '2027-03-09T10:00:00.000Z',
      kind: 'answered',
      messageRef: 'note-9',
      answer: 'Done.',
    },
  ]);

  await ctx.runSteps();

  const messages = await ctx.readMessagesTo('conversation');

  expect(messages).toStrictEqual([]);
});

test("it sends the user's message as a note, and the answer to the report target", async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session();

  await ctx.sendFromUser(taskID, 'Use the staging database.');
  await ctx.runSteps();
  await ctx.runActions();
  await ctx.runSteps();

  await ctx.deliver(taskID, [
    {
      session: 'cloud.3f9a1c2e.00000001',
      eventKey: 'cloud|1',
      at: '2027-03-09T10:00:00.000Z',
      kind: 'answered',
      messageRef: 'note-1',
      answer: 'Switched to staging.',
    },
  ]);

  await ctx.runSteps();

  const messages = await ctx.readMessagesTo('conversation');

  expect(messages).toStrictEqual([
    {
      from: taskID,
      kind: 'progress',
      hop: 1,
      replyTo: null,
      outside: true,
      body: 'The coding session answered: Switched to staging.',
    },
  ]);
});

test('it tells the sender that the session did not get a message sent before the session started', async () => {
  const ctx = await setupTest();

  const claim = ctx.claim;

  const taskID = await ctx.startTask(claim, {
    name: 'Fix the flaky login test',
    brief: 'Find why the login test fails.',
    repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
  });

  const sent = await ctx.sendFromConversation(taskID, 'Is the retry count still 3?');

  const messageID = sent.status === 'sent' ? sent.messageID : '';

  await ctx.runSteps();

  const messages = await ctx.readMessagesTo('conversation');

  expect(messages).toStrictEqual([
    {
      from: taskID,
      kind: 'reply',
      hop: 2,
      replyTo: messageID,
      outside: false,
      body: 'The coding session has not started yet, so it did not get your message.',
    },
  ]);
});

test('it ends the task as done when the session ends and a forget erased the event', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session({ wake: [] });

  await ctx.deliver(taskID, [
    {
      session: 'cloud.3f9a1c2e.00000001',
      eventKey: 'cloud|1',
      at: '2027-03-09T10:00:00.000Z',
      kind: 'state',
      state: 'ended',
      question: null,
    },
  ]);

  await ctx.forgetEvents(taskID);
  await ctx.runSteps();

  const state = await ctx.readTaskState(taskID);

  expect(state).toBe('done');
});

test('it replies once to an answer whose note settles after the step read its inbox', async () => {
  const ctx = await setupTest();
  const taskID = await ctx.seed.session();
  const sent = await ctx.sendFromConversation(taskID, 'Is the retry count still 3?');

  const messageID = sent.status === 'sent' ? sent.messageID : '';

  await ctx.runSteps();

  await ctx.deliver(taskID, [
    {
      session: 'cloud.3f9a1c2e.00000001',
      eventKey: 'cloud|1',
      at: '2027-03-09T10:00:00.000Z',
      kind: 'answered',
      messageRef: 'note-1',
      answer: 'It is 5 now.',
    },
  ]);

  await ctx.runStepAfter(taskID, () => ctx.runActions());
  await ctx.runSteps();

  const messages = await ctx.readMessagesTo('conversation');

  expect(messages.filter((message) => message.kind === 'reply')).toStrictEqual([
    {
      from: taskID,
      kind: 'reply',
      hop: 2,
      replyTo: messageID,
      outside: true,
      body: 'The coding session answered: It is 5 now.',
    },
  ]);
});

test('it ends a started task as done, and binds nothing, when another task joined its session first', async () => {
  const ctx = await setupTest();

  const startedID = await ctx.startTask(ctx.claim, {
    name: 'Fix the flaky login test',
    brief: 'Find why the login test fails.',
    repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
  });

  await ctx.runActions();

  const session = await ctx.listSession();

  const joinedID = await ctx.startTask(ctx.claim, {
    name: 'Watch the login fix',
    brief: 'Watch for a question.',
    session,
  });

  await ctx.runSteps();

  const reports = await readRecords(ctx.log, {
    afterSequence: 0,
    thread: startedID,
    kinds: ['task.run_ended'],
  });

  expect({
    state: await ctx.readTaskState(startedID),
    binding: await ctx.readBinding(startedID),
    owners: await ctx.readOwners('cloud.3f9a1c2e.00000001'),
    reports: reports.map((entry) => entry.record.erasable),
  }).toStrictEqual({
    state: 'done',
    binding: null,
    owners: new Map([['cloud.3f9a1c2e.00000001', joinedID]]),
    reports: [
      {
        status: 'readable',
        fields: {
          body: `report:\n  summary: "The coding session started, but the task ${joinedID} joined it first, so this task let it go."`,
        },
      },
    ],
  });
});

test('it ends a started task as done, and binds nothing, when another task joins its session between the step reads and its commit', async () => {
  const ctx = await setupTest();

  const startedID = await ctx.startTask(ctx.claim, {
    name: 'Fix the flaky login test',
    brief: 'Find why the login test fails.',
    repo: { url: 'https://github.com/example/shop.git', ref: 'main' },
  });

  await ctx.runActions();

  const session = await ctx.listSession();

  let joinedID = '';

  await ctx.runStepThen(startedID, async () => {
    joinedID = await ctx.startTask(ctx.claim, {
      name: 'Watch the login fix',
      brief: 'Watch for a question.',
      session,
    });
  });

  const reports = await readRecords(ctx.log, {
    afterSequence: 0,
    thread: startedID,
    kinds: ['task.run_ended'],
  });

  expect({
    state: await ctx.readTaskState(startedID),
    binding: await ctx.readBinding(startedID),
    owners: await ctx.readOwners('cloud.3f9a1c2e.00000001'),
    reports: reports.map((entry) => entry.record.erasable),
  }).toStrictEqual({
    state: 'done',
    binding: null,
    owners: new Map([['cloud.3f9a1c2e.00000001', joinedID]]),
    reports: [
      {
        status: 'readable',
        fields: {
          body: `report:\n  summary: "The coding session started, but the task ${joinedID} joined it first, so this task let it go."`,
        },
      },
    ],
  });
});
