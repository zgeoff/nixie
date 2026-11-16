import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runOracle, startSpawnedNixie } from '@heynixie/server/test-utils';
import type { ScriptedModelRequest } from '@heynixie/testing';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';

type RequestBody = NonNullable<ScriptedModelRequest['body']>;

async function setupTest() {
  const exampleDir = join(import.meta.dir, '../docs/guides/examples/memory-consolidation');

  const nixie = await startSpawnedNixie({
    isCheckerScripted: true,
    taskDefinitions: [
      {
        id: 'memory-consolidation',
        yaml: readFileSync(join(exampleDir, 'task.yaml'), 'utf8'),
        instructions: readFileSync(join(exampleDir, 'instructions.md'), 'utf8'),
      },
    ],
  });

  return { nixie };
}

test('it fires the weekly memory consolidation example and holds each edit as a proposal', async () => {
  const ctx = await setupTest();

  const process = ctx.nixie.harness.start();

  await process.ready;

  await ctx.nixie.waitForQueueCheck();

  // The first slot is Sunday 03:00 in Sydney, which is clock 234_000_000 ms, and the clock starts at
  // 1_000_000 ms. Moving to within 3 minutes of it first keeps the conversation's own timers out of the advance that follows the seeding.
  await ctx.nixie.harness.advance(232_900_000, { settle: true });

  ctx.nixie.checkerModel.addReplies(
    ...[1, 2].map(() => ({
      toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } },
    })),
  );

  const facts = [
    { gist: 'bike shop', topic: 'errands', quote: 'bike shop closes at five' },
    { gist: 'library card', topic: 'errands', quote: 'library card expires in June' },
  ];

  ctx.nixie.model.addReplies(
    ...facts.map((fact) => ({
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: {
          subject: 'owner',
          gist: fact.gist,
          topic: fact.topic,
          text: `The ${fact.quote}.`,
          quote: fact.quote,
        },
      },
    })),
    { text: 'Saved both.' },
  );

  void process.request('sendMessage', {
    thread: 'conversation',
    text: 'Remember that the bike shop closes at five and the library card expires in June.',
  });

  await waitForCondition(async () => {
    const saved = await ctx.nixie.readMemoryItems();

    return saved.length === 2;
  });

  await waitForCondition(() => ctx.nixie.model.requests.length >= 3);

  // The model reads an item by its short ID, which the result of its save gives.
  const savedResults = JSON.stringify(ctx.nixie.model.requests.at(-1)?.body);

  const itemIDs = [...savedResults.matchAll(/itemID\\+":\\+"(?<id>\w+)/gu)].map(
    (match) => match.groups?.['id'],
  );

  const [firstID, secondID] = [...new Set(itemIDs)];

  invariant(firstID !== undefined && secondID !== undefined);

  // The conversation holds task_start and a task does not, so the filter tells their turns apart.
  const taskReplies = [
    { toolUse: { name: 'mcp__nixie__memory_recall', input: { itemIDs: [firstID, secondID] } } },
    {
      toolUse: {
        name: 'mcp__nixie__memory_edit',
        input: { itemID: firstID, version: 1, text: 'The bike shop closes at five each day.' },
      },
    },
    {
      toolUse: {
        name: 'mcp__nixie__memory_edit',
        input: { itemID: secondID, version: 1, text: 'The library card expires in June.' },
      },
    },
    { toolUse: { name: 'mcp__nixie__task_report', input: { summary: 'Reworded 2 items.' } } },
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

  await ctx.nixie.harness.advance(180_000, { settle: true });

  const fired = await ctx.nixie.waitForRecord((record) => record.kind === 'trigger.fired');

  await waitForCondition(async () => {
    const records = await ctx.nixie.readRecords();

    return records.filter((record) => record.kind === 'memory.proposed').length === 2;
  });

  await process.kill();

  const records = await ctx.nixie.readRecords();
  const items = await ctx.nixie.readMemoryItems();
  const oracle = await runOracle(ctx.nixie);

  // A task's request holds no task_start, which every conversation request holds.
  const taskRequest = ctx.nixie.model.requests.find(
    (request) =>
      request.body?.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') === false,
  );

  const toolNames = taskRequest?.body?.tools?.map((tool) => tool.name) ?? [];
  const proposals = records.filter((record) => record.kind === 'memory.proposed');

  expect(fired.payload).toMatchObject({
    definitionID: 'memory-consolidation',
    scheduledFor: '1970-01-03T17:00:00.000Z',
  });

  expect(toolNames).toStrictEqual(
    expect.arrayContaining([
      'mcp__nixie__memory_recall',
      'mcp__nixie__memory_edit',
      'mcp__nixie__memory_retire',
    ]),
  );

  expect(proposals.map((record) => record.payload)).toMatchObject([
    { origin: 'task', reviewReason: 'no_quote' },
    { origin: 'task', reviewReason: 'no_quote' },
  ]);

  expect(proposals.map((record) => record.payload['itemID']).toSorted()).toStrictEqual(
    items.map((item) => item.itemID).toSorted(),
  );

  expect(records.some((record) => record.kind === 'memory.consolidation_proposed')).toBe(false);

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
