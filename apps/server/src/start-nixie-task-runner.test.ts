import { expect, onTestFinished, test } from 'bun:test';
import type { LogRecord } from '@heynixie/contract';
import type { ReceivedFrame } from '@heynixie/sandbox/test-utils';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createApprovedItems } from './test-utils/create-approved-items';
import { createTestClient } from './test-utils/create-test-client';
import { sendClientMessage } from './test-utils/send-client-message';
import { startInProcessNixie } from './test-utils/start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie({
    roleModelURLs: { task: 'http://127.0.0.1:4040' },
    selectableModelURLs: { 'second-look': 'http://127.0.0.1:4060' },
  });

  const api = await createTestClient(nixie);

  const findTurns = (isOwner: (owner: string) => boolean) =>
    nixie.guest.received.filter(
      (received): received is ReceivedFrame & { frame: { type: 'turn' } } =>
        received.frame.type === 'turn' && isOwner(received.owner),
    );

  return {
    nixie,
    api,
    readTaskTurns: () => findTurns((owner) => owner !== 'conversation'),
    readConversationTurns: () => findTurns((owner) => owner === 'conversation'),
    readStartedTaskID: () => {
      const started = nixie.toolResults.find((result) => result.name === 'task.start');

      invariant(started, 'the conversation started a task');

      return z
        .object({ structuredContent: z.object({ taskID: z.string() }) })
        .parse(JSON.parse(started.result)).structuredContent.taskID;
    },
  };
}

test("it runs the task that the conversation starts in a worker imp it owns, and the task's report reaches the conversation", async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addKindReplies(
    'conversation',
    {
      toolUse: {
        name: 'task.start',
        input: { name: 'Tide tables', brief: 'Find the high tides at Bramble Quay on Saturday.' },
      },
    },
    { text: 'Passed to the Tide tables task.' },
    { text: 'Saturday has a high tide at 06:42.' },
  );

  ctx.nixie.guest.addKindReplies(
    'worker',
    {
      toolUse: {
        name: 'task.message',
        input: {
          to: 'conversation',
          kind: 'report',
          body: 'High tide at Bramble Quay on Saturday is at 06:42.',
        },
      },
    },
    { text: 'Reported.' },
  );

  await sendClientMessage(
    ctx.api.client,
    { text: 'When is high tide on Saturday?' },
    'Passed to the Tide tables task.',
  );

  await waitForCondition(() =>
    ctx
      .readConversationTurns()
      .some((turn) => turn.frame.input.some((message) => message.text.includes('06:42'))),
  );

  const taskID = ctx.readStartedTaskID();

  const sandboxes = await ctx.nixie.guest.adapter.list(taskID);

  const [taskTurn] = ctx.readTaskTurns();

  expect(sandboxes.map((sandbox) => [sandbox.spec.kind, sandbox.spec.owner])).toStrictEqual([
    ['worker', taskID],
  ]);

  expect(taskTurn?.owner).toBe(taskID);
  expect(taskTurn?.frame.profile.baseURL).toStartWith('http://127.0.0.1:4040');

  expect(ctx.readConversationTurns().at(-1)?.frame.input.at(-1)?.text).toInclude(
    `<task-message id="`,
  );
});

test("it ends the conversation's turn that the task's report woke with no reply, and the client reads the turn as silent", async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addKindReplies(
    'conversation',
    {
      toolUse: {
        name: 'task.start',
        input: { name: 'Tide tables', brief: 'Find the high tides at Bramble Quay on Saturday.' },
      },
    },
    { text: 'Passed to the Tide tables task.' },
    { toolUse: { name: 'turn.end_silently', input: {} } },
    { text: 'The tide report is in.' },
  );

  ctx.nixie.guest.addKindReplies(
    'worker',
    {
      toolUse: {
        name: 'task.message',
        input: {
          to: 'conversation',
          kind: 'report',
          body: 'High tide at Bramble Quay on Saturday is at 06:42.',
        },
      },
    },
    { text: 'Reported.' },
  );

  await sendClientMessage(
    ctx.api.client,
    { text: 'When is high tide on Saturday?' },
    'Passed to the Tide tables task.',
  );

  const page: { records: readonly LogRecord[] } = { records: [] };

  await waitForCondition(async () => {
    const read = await ctx.api.client.conversation.read({ thread: 'conversation' });

    page.records = read.records;

    return page.records.some((record) => record.isSilentTurn === true);
  });

  const ended = ctx.nixie.toolResults.find((result) => result.name === 'turn.end_silently');

  expect(page.records.filter((record) => record.kind === 'model.reply')).toStrictEqual([
    {
      kind: 'model.reply',
      message: { text: 'Passed to the Tide tables task.' },
      recordedAt: expect.any(Date),
      sequence: expect.any(Number),
      thread: 'conversation',
    },
  ]);

  expect(page.records.findLast((record) => record.kind === 'model.turn_ended')).toStrictEqual({
    context: { size: expect.any(Number), window: 200_000 },
    isSilentTurn: true,
    kind: 'model.turn_ended',
    recordedAt: expect.any(Date),
    sequence: expect.any(Number),
    thread: 'conversation',
  });

  expect(JSON.parse(ended?.result ?? '{}')).toStrictEqual({
    _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'nixie', version: expect.any(String) } },
    content: [],
    structuredContent: {
      note: 'This turn ends with nothing sent. Write no more text: nixie keeps no reply from this turn.',
    },
  });
});

test("it gives a stranger's tool run the task tools, the clock and the silent end alone, under the task prompt with no persona or memory", async () => {
  const held = Promise.withResolvers<void>();

  onTestFinished(() => {
    held.resolve();
  });

  const ctx = await setupTest();

  ctx.nixie.guest.addKindReplies(
    'conversation',
    {
      toolUse: {
        name: 'task.start',
        input: {
          name: 'Tide tables',
          brief: 'Find the high tides at Bramble Quay on Saturday.',
          persona: 'none',
        },
      },
    },
    { text: 'Passed to the Tide tables task.' },
  );

  // The step's token lists the run's tools only while the step runs, so the reply holds it open.
  ctx.nixie.guest.addKindReplies('worker', { text: 'Working on it.', gate: () => held.promise });

  await sendClientMessage(
    ctx.api.client,
    { text: 'When is high tide on Saturday?' },
    'Passed to the Tide tables task.',
  );

  await waitForCondition(() => ctx.readTaskTurns().length === 1);

  const [taskTurn] = ctx.readTaskTurns();

  invariant(taskTurn, 'the task ran a turn');

  const tools = await ctx.nixie.readToolNames(taskTurn);

  const input = taskTurn.frame.input.map((message) => message.text).join('\n');

  expect(tools).toIncludeSameMembers([
    'tasks.list',
    'task.message',
    'time.now',
    'turn.end_silently',
  ]);

  expect(taskTurn.frame.systemPrompt).toStartWith('You are "Tide tables", a task working for');
  expect(input).toInclude('Find the high tides at Bramble Quay on Saturday.');
  expect(taskTurn.frame.systemPrompt).not.toInclude('You are nixie.');
  expect(input).not.toInclude('type="pinned-memory"');
  expect(input).not.toInclude('type="retrieved-memory"');
});

test('it runs a stranger that the conversation starts on another model, and its report returns as a task message', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addKindReplies(
    'conversation',
    {
      toolUse: {
        name: 'task.start',
        input: {
          name: 'Second look',
          brief: 'Find the weak points in the four-bed garden plan.',
          model: 'second-look',
          persona: 'none',
          memory: 'none',
          tools: ['time.now'],
        },
      },
    },
    { text: 'Passed to the Second look task.' },
    { text: 'The second look found one weak point.' },
  );

  ctx.nixie.guest.addKindReplies(
    'worker',
    {
      toolUse: {
        name: 'task.message',
        input: {
          to: 'conversation',
          kind: 'report',
          body: 'The north bed gets no afternoon sun.',
        },
      },
    },
    { text: 'Reported.' },
  );

  await sendClientMessage(
    ctx.api.client,
    { text: 'Get a second opinion on the garden plan.' },
    'Passed to the Second look task.',
  );

  await waitForCondition(() =>
    ctx
      .readConversationTurns()
      .some((turn) =>
        turn.frame.input.some((message) => message.text.includes('no afternoon sun')),
      ),
  );

  const [taskTurn] = ctx.readTaskTurns();
  const report = ctx.readConversationTurns().at(-1)?.frame.input.at(-1)?.text ?? '';

  invariant(taskTurn);

  expect(taskTurn.frame.profile).toStrictEqual({
    harness: 'agent-sdk',
    model: 'second-look-test-model',
    baseURL: 'http://127.0.0.1:4060',
    authHeader: 'bearer',
    effort: 'low',
    contextTokens: null,
    cacheTTL: '5m',
  });

  expect(taskTurn.frame.systemPrompt).not.toInclude('You are nixie.');

  expect(report).toMatch(
    /<task-message id="\w+" from="task: Second look" kind="report"[^>]*>\nThe north bed gets no afternoon sun\./u,
  );
});

test("it purges the session of a started task that reads memory when the user forgets an item, and the task's next turn opens a new session", async () => {
  const ctx = await setupTest();

  // BM25 ranks nothing in an index of 1 or 2 items, so per-turn retrieval needs 3 to place one
  const [key] = await createApprovedItems(ctx.nixie, ctx.api.client, [
    'The spare key sits under the blue flowerpot',
    'Allergic to hazelnuts',
    'Prefers window seats on trains',
  ]);

  ctx.nixie.guest.addKindReplies(
    'conversation',
    {
      toolUse: {
        name: 'task.start',
        input: {
          name: 'Key check',
          brief: 'Check where the spare key is kept.',
          persona: 'default',
          memory: 'read',
        },
      },
    },
    { text: 'Passed to the Key check task.' },
  );

  ctx.nixie.guest.addKindReplies('worker', { text: 'Checked.' }, { text: 'Checked again.' });

  await sendClientMessage(
    ctx.api.client,
    { text: 'Where is the spare key kept?' },
    'Passed to the Key check task.',
  );

  await waitForCondition(() => ctx.readTaskTurns().length === 1);

  const taskID = ctx.readStartedTaskID();

  const [sandbox] = await ctx.nixie.guest.adapter.list(taskID);

  invariant(sandbox);

  await ctx.api.client.memory.forget({ clientActionID: crypto.randomUUID(), ...key, version: 1 });

  ctx.nixie.guest.addKindReplies(
    'conversation',
    {
      toolUse: {
        name: 'task.message',
        input: { to: taskID, kind: 'request', body: 'Check the key once more.' },
      },
    },
    { text: 'Asked the Key check task again.' },
  );

  await sendClientMessage(
    ctx.api.client,
    { text: 'Ask it to check again.' },
    'Asked the Key check task again.',
  );

  await waitForCondition(() => ctx.readTaskTurns().length === 2);

  const [first, second] = ctx.readTaskTurns();

  expect(ctx.nixie.guest.purged).toContain(sandbox.id);
  expect(first?.frame.resume).toBeNull();
  expect(second?.frame.resume).toBeNull();
});

test('it claims and answers a message to the conversation while every claim loop of the started tasks is busy', async () => {
  const held = Promise.withResolvers<void>();

  onTestFinished(() => {
    held.resolve();
  });

  const ctx = await setupTest();

  ctx.nixie.guest.addKindReplies(
    'conversation',
    { toolUse: { name: 'task.start', input: { name: 'Tide tables', brief: 'Find the tides.' } } },
    { toolUse: { name: 'task.start', input: { name: 'Moon phases', brief: 'List the moons.' } } },
    { text: 'Started both.' },
    { text: 'It is sunny at the quay.' },
  );

  ctx.nixie.guest.addKindReplies(
    'worker',
    { text: 'Still on the tides.', gate: () => held.promise },
    { text: 'Still on the moons.', gate: () => held.promise },
  );

  await sendClientMessage(ctx.api.client, { text: 'Start the tides and moons.' }, 'Started both.');
  await waitForCondition(() => ctx.readTaskTurns().length === 2);

  const answered = await sendClientMessage(
    ctx.api.client,
    { text: 'Is it sunny at the quay?' },
    'It is sunny at the quay.',
  );

  const busy = ctx.readTaskTurns().length;

  expect(answered.map((record) => record.message?.text)).toContain('It is sunny at the quay.');
  expect(busy).toBe(2);
});
