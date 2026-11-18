import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  createTestClient,
  runOracle,
  sendClientMessage,
  startE2ENixie,
} from '@heynixie/server/test-utils';
import type { ScriptedModelRequest } from '@heynixie/testing';
import invariant from 'tiny-invariant';

type RequestBody = NonNullable<ScriptedModelRequest['body']>;

async function setupTest() {
  const exampleDir = join(import.meta.dir, '../../../docs/guides/examples/moment-reflection');

  const nixie = await startE2ENixie({
    taskDefinitions: [
      {
        id: 'moment-reflection',
        yaml: readFileSync(join(exampleDir, 'task.yaml'), 'utf8'),
        instructions: readFileSync(join(exampleDir, 'instructions.md'), 'utf8'),
      },
    ],
  });

  return { nixie };
}

test('it fires the daily moment reflection example and labels its reflection with the task run model', async () => {
  const ctx = await setupTest();

  const process = ctx.nixie.harness.start();

  await process.ready;

  await ctx.nixie.waitForQueueCheck();

  const api = await createTestClient(process);

  ctx.nixie.model.addReplies({ text: 'Sure, I will descale the kettle.' });

  const records = await sendClientMessage(
    api.client,
    { text: 'Descale the kettle with vinegar this weekend.' },
    'Sure, I will descale the kettle.',
    { timeoutMs: 30_000 },
  );

  const sent = records.find(
    (record) => record.message?.text === 'Descale the kettle with vinegar this weekend.',
  );

  invariant(sent);

  const kept = await api.client.memory.keepMoment({
    clientActionID: crypto.randomUUID(),
    firstSequence: sent.sequence,
    lastSequence: sent.sequence,
    thread: 'conversation',
    title: 'The kettle descaling',
  });

  const before = await api.client.memory.readMoment({ momentID: kept.momentID });

  // The conversation holds task_start and a task does not, so the filter tells their turns apart.
  const taskReplies = [
    { toolUse: { name: 'mcp__nixie__moment_read', input: { momentID: kept.shortID } } },
    {
      toolUse: {
        name: 'mcp__nixie__moment_edit',
        input: {
          momentID: kept.shortID,
          version: before.version,
          reflection: 'A small chore, set for the weekend.',
        },
      },
    },
    { toolUse: { name: 'mcp__nixie__task_report', input: { summary: 'Reflected on 1 moment.' } } },
    { text: 'Done.' },
  ].map((reply) =>
    Object.assign(reply, {
      when: (body: RequestBody) =>
        body.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') !== true,
    }),
  );

  ctx.nixie.model.addReplies(...taskReplies, {
    text: 'Noted.',
    when: (body) => body.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') === true,
  });

  // The first slot is 04:00 in Sydney, which is clock 64_800_000 ms, and the clock starts at
  // 1_000_000 ms. Moving to within 3 minutes of it first keeps the conversation's own timers out of
  // the advance that follows.
  await ctx.nixie.harness.advance(63_720_000, { settle: true });
  await ctx.nixie.harness.advance(180_000, { settle: true });

  const fired = await ctx.nixie.waitForRecord((record) => record.kind === 'trigger.fired');

  await ctx.nixie.waitForRecord((record) => record.kind === 'moment_edited');

  const after = await api.client.memory.readMoment({ momentID: kept.momentID });

  await process.kill();

  const taskRecords = await ctx.nixie.readRecords();
  const oracle = await runOracle(ctx.nixie);

  // The task run's model ID, as its own tool call records it.
  const editCall = taskRecords.find(
    (record) => record.kind === 'tool_called' && record.payload['tool'] === 'moment.edit',
  );

  const runModel = editCall?.payload['model'];

  invariant(typeof runModel === 'string');

  // A task's request holds no task_start, which every conversation request holds.
  const taskRequest = ctx.nixie.model.requests.find(
    (request) =>
      request.body?.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') === false,
  );

  const toolNames = taskRequest?.body?.tools?.map((tool) => tool.name) ?? [];

  expect(fired.payload).toMatchObject({
    definitionID: 'moment-reflection',
    scheduledFor: '1970-01-01T18:00:00.000Z',
  });

  expect(toolNames).toStrictEqual(
    expect.arrayContaining([
      'mcp__nixie__moment_find',
      'mcp__nixie__moment_read',
      'mcp__nixie__moment_edit',
      'mcp__nixie__log_read',
    ]),
  );

  expect(after.reflections).toMatchObject([
    { model: runModel, text: 'A small chore, set for the weekend.' },
  ]);

  expect(after.title).toBe('The kettle descaling');

  expect(oracle).toStrictEqual({
    repeatedStepKeys: [],
    repeatedActions: [],
    strayCalls: [],
    heldLeases: [],
    unreadyTasks: [],
    changedEndStates: [],
    projectionDrift: [],
  });
});
