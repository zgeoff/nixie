import { expect, onTestFinished, test } from 'bun:test';
import type { ReceivedFrame } from '@heynixie/sandbox/test-utils';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createTestClient } from './test-utils/create-test-client';
import { sendClientMessage } from './test-utils/send-client-message';
import { startInProcessNixie } from './test-utils/start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie({ roleModelURLs: { task: 'http://127.0.0.1:4040' } });
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

test("it gives a started task's tool run the task tools and the clock alone, under the task prompt with no persona or memory", async () => {
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
        input: { name: 'Tide tables', brief: 'Find the high tides at Bramble Quay on Saturday.' },
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

  expect(tools).toIncludeSameMembers(['tasks.list', 'task.message', 'time.now']);

  expect(taskTurn.frame.systemPrompt).toStartWith(
    'You are "Tide tables", one of the tasks that nixie runs for',
  );

  expect(taskTurn.frame.systemPrompt).toInclude(
    'Your brief:\n\nFind the high tides at Bramble Quay on Saturday.',
  );

  expect(taskTurn.frame.systemPrompt).not.toInclude('You are nixie.');
  expect(input).not.toInclude('type="pinned-memory"');
  expect(input).not.toInclude('type="retrieved-memory"');
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
