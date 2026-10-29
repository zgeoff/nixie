import { expect, test } from 'bun:test';
import { githubAPIURL } from '@heynixie/definitions-github/mocks';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createTestClient } from './test-utils/create-test-client';
import { runHostCommand } from './test-utils/run-host-command';
import { sendClientMessage } from './test-utils/send-client-message';
import { startInProcessNixie } from './test-utils/start-in-process-nixie';

async function setupTest() {
  const nixie = await startInProcessNixie();

  return nixie;
}

test('it serves prompt_read to the conversation, which returns the built-in compaction prompt', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies(
    { toolUse: { name: 'prompt_read', input: { id: 'compaction' } } },
    { text: 'Read it.' },
  );

  await sendClientMessage(api.client, { text: 'Show me the compaction prompt.' }, 'Read it.');

  const read = ctx.toolResults.at(-1);

  invariant(read);

  const answer: unknown = JSON.parse(read.result);

  expect(read.name).toBe('prompt_read');

  expect(answer).toMatchObject({
    structuredContent: {
      id: 'compaction',
      parts: [
        { name: 'instruction', override: null },
        { name: 'safety', override: null },
      ],
      template: { text: '{{ parts.instruction }}\n{{ parts.safety }}', override: null },
    },
  });
});

test('it refuses a prompt_write proposal whose template reads a path the prompt does not accept, and keeps no proposal', async () => {
  const nixie = await startInProcessNixie({
    extraDefinitions: [
      'export:',
      '  repository: harbour/definitions',
      `  api_url: ${githubAPIURL}`,
    ],
    extraSecrets: ['definitions_export_token: token-a'],
  });

  const api = await createTestClient(nixie);

  nixie.guest.addReplies(
    {
      toolUse: {
        name: 'prompt_write',
        input: {
          id: 'compaction',
          entry: { _template: '{{ parts.instruction }}\n{{ owner.birthday }}' },
          files: [],
          reason: 'Greet the owner on the day.',
        },
      },
    },
    { text: 'Refused.' },
  );

  await sendClientMessage(api.client, { text: 'Mention my birthday.' }, 'Refused.');

  const written = nixie.toolResults.at(-1);

  invariant(written);

  const answer: unknown = JSON.parse(written.result);

  const pending = await runHostCommand(nixie.configPath, ['prompt-pending']);

  expect(written.name).toBe('prompt_write');

  expect(answer).toMatchObject({
    isError: true,
    content: [
      {
        type: 'text',
        text: 'the override fails the definitions checks: nixie.yaml: the template of the compaction prompt reads {{ owner.birthday }}, which it does not accept; it accepts owner.name, owner.nameAtSentenceStart, summary.words, parts.instruction, parts.safety',
      },
    ],
  });

  expect(pending.stdout.trim()).toBe('[]');
});

test('it starts a task from the conversation, routes the message to it, and the reply names the task', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies(
    {
      toolUse: {
        name: 'task.start',
        input: { name: 'Garden plan', brief: 'Plan four raised beds for a spring sowing.' },
      },
    },
    { text: 'I passed this to the Garden plan task, where it is queued.' },
  );

  const records = await sendClientMessage(
    api.client,
    { text: 'Plan the vegetable beds for spring.' },
    'I passed this to the Garden plan task, where it is queued.',
  );

  const started = ctx.toolResults.at(-1);

  invariant(started);

  const answer = z
    .object({ structuredContent: z.object({ taskID: z.string(), name: z.string() }) })
    .parse(JSON.parse(started.result));

  const message = records.find((record) => record.kind === 'owner_message');

  invariant(message);

  expect(answer.structuredContent.name).toBe('Garden plan');

  expect(records.find((record) => record.kind === 'task.routed')?.route).toStrictEqual({
    isMove: false,
    messages: [message.sequence],
    taskID: answer.structuredContent.taskID,
  });
});

test('it holds a started task waiting with its message unread, and never fails it', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies(
    {
      toolUse: {
        name: 'task.start',
        input: { name: 'Garden plan', brief: 'Plan four raised beds for a spring sowing.' },
      },
    },
    { text: 'Started.' },
  );

  await sendClientMessage(api.client, { text: 'Plan the vegetable beds for spring.' }, 'Started.');

  const listed = await api.client.tasks.list({});

  const garden = listed.tasks.find((task) => task.name === 'Garden plan');

  invariant(garden);

  ctx.guest.addReplies(
    {
      toolUse: {
        name: 'task.message',
        input: { to: garden.taskID, kind: 'report', body: 'Use the north bed for beans.' },
      },
    },
    { text: 'Passed on.' },
  );

  await sendClientMessage(api.client, { text: 'Beans go in the north bed.' }, 'Passed on.');

  await waitForCondition(async () => {
    const page = await api.client.conversation.read({ thread: garden.taskID });

    return page.records.filter((record) => record.kind === 'task.step_committed').length >= 2;
  });

  const page = await api.client.conversation.read({ thread: garden.taskID });
  const after = await api.client.tasks.list({});

  expect(page.records.map((record) => record.kind)).not.toContain('task.step_errored');
  expect(after.tasks.find((task) => task.taskID === garden.taskID)?.state).toBe('waiting');
});

test('it puts the task board in the newest turn and keeps the system prompt the same bytes between turns', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  ctx.guest.addReplies(
    {
      toolUse: {
        name: 'task.start',
        input: { name: 'Seed order', brief: 'Order the bean and pea seed for spring.' },
      },
    },
    { text: 'Started.' },
    { text: 'It is on your board.' },
  );

  await sendClientMessage(api.client, { text: 'Order the spring seed.' }, 'Started.');
  await sendClientMessage(api.client, { text: 'What is on my board?' }, 'It is on your board.');

  const [first, second] = ctx.guest.turns;

  invariant(first);
  invariant(second);

  expect(second.systemPrompt).toBe(first.systemPrompt);
  expect(second.systemPrompt).not.toInclude('Seed order');

  expect(second.input[0]?.text).toMatch(
    /<system-message type="task-board"[^>]*>\n.+\n.+\n<task-data id="[\da-f]{12}">\n[^<]*Seed order/u,
  );
});
