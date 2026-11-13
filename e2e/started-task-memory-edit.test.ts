import { expect, test } from 'bun:test';
import { startSpawnedNixie } from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';

async function setupTest() {
  const nixie = await startSpawnedNixie({ memoryWriter: true });

  return { nixie };
}

test('it holds the edit of a started task that reads memory as a proposal, made by the task, with no quote', async () => {
  const ctx = await setupTest();

  const process = ctx.nixie.harness.start();

  await process.ready;

  await ctx.nixie.waitForQueueCheck();

  // The writer runs on its own model and has nothing to stage from this message.
  ctx.nixie.writerModel.addReplies({ text: 'Nothing to stage.' }, { text: 'Nothing to stage.' });

  ctx.nixie.checkerModel.addReplies({
    toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } },
  });

  ctx.nixie.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: {
          subject: 'owner',
          text: 'Your dentist is on Marsh Lane.',
          quote: 'dentist is on Marsh Lane',
        },
      },
    },
    { text: 'Saved it.' },
  );

  void process.request('sendMessage', {
    thread: 'conversation',
    text: 'My dentist is on Marsh Lane',
  });

  await ctx.nixie.waitForRecord((record) => record.kind === 'memory.version_added');

  await waitForCondition(() => ctx.nixie.model.requests.length >= 2);

  // The model reads an item by its short ID, which the save's result gives.
  const savedResult = JSON.stringify(ctx.nixie.model.requests.at(-1)?.body);
  const itemID = /itemID\\+":\\+"(?<id>\w+)/u.exec(savedResult)?.groups?.['id'];

  invariant(itemID !== undefined);

  // The conversation's turn after the start and the task's first turn ask at the same time, so
  // each reply says which of them it answers.
  ctx.nixie.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__task_start',
        input: {
          name: 'Dentist note',
          brief: 'Look up the dentist item and reword it.',
          memory: 'read',
          tools: ['memory.recall', 'memory.edit'],
        },
      },
    },
    {
      text: 'Started.',
      when: (body) => body.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') === true,
    },
    {
      toolUse: { name: 'mcp__nixie__memory_recall', input: { itemIDs: [itemID] } },
      when: (body) => body.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') !== true,
    },
    {
      toolUse: {
        name: 'mcp__nixie__memory_edit',
        input: { itemID, version: 1, text: 'Your dentist is on Marsh Road.' },
      },
      when: (body) => body.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') !== true,
    },
    {
      text: 'The edit waits for review.',
      when: (body) => body.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') !== true,
    },
  );

  void process.request('sendMessage', { thread: 'conversation', text: 'Now fix the dentist.' });

  const proposed = await ctx.nixie.waitForRecord(
    (record) => record.kind === 'memory.proposed' && record.payload['origin'] === 'task',
  );

  const created = await ctx.nixie.waitForRecord(
    (record) => record.kind === 'task.created' && record.payload['startedBy'] === 'conversation',
  );

  const items = await ctx.nixie.readMemoryItems();

  await process.kill();

  expect(proposed.payload).toMatchObject({
    reviewReason: 'no_quote',
    origin: 'task',
    taskID: created.payload['taskID'],
    itemID: items[0]?.itemID,
  });

  expect(items).toStrictEqual([{ itemID: expect.toBeString(), version: 1, state: 'active' }]);
});
