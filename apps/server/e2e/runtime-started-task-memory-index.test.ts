import { expect, test } from 'bun:test';
import { startE2ENixie } from '@heynixie/server/test-utils';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';

async function setupTest() {
  const nixie = await startE2ENixie({ isCheckerScripted: true });

  return { nixie };
}

test('it opens a started task that reads memory with the count of remembered items and no recall record', async () => {
  const ctx = await setupTest();

  const process = ctx.nixie.harness.start();

  await process.ready;

  await ctx.nixie.waitForQueueCheck();

  ctx.nixie.checkerModel.addReplies(
    ...[1, 2, 3].map(() => ({
      toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } },
    })),
  );

  const facts = [
    { gist: 'bike pump', topic: 'home', quote: 'bike pump is behind the shed door' },
    { gist: 'piano tuning', topic: 'home', quote: 'piano is tuned each March' },
    { gist: 'recycling day', topic: 'routines', quote: 'recycling goes out Thursday night' },
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
    { text: 'Saved all three.' },
  );

  void process.request('sendMessage', {
    thread: 'conversation',
    text: 'Remember that the bike pump is behind the shed door, the piano is tuned each March, and recycling goes out Thursday night.',
  });

  await waitForCondition(async () => {
    const items = await ctx.nixie.readMemoryItems();

    return items.length === 3;
  });

  // The conversation's turn after the start and the task's first turn ask at the same time, so
  // each reply says which of them it answers.
  ctx.nixie.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__task_start',
        input: { name: 'Shed check', brief: 'Say hello.', memory: 'read', tools: [] },
      },
    },
    {
      text: 'Started.',
      when: (body) => body.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') === true,
    },
    {
      text: 'Hello.',
      when: (body) => body.tools?.some((tool) => tool.name === 'mcp__nixie__task_start') !== true,
    },
  );

  void process.request('sendMessage', { thread: 'conversation', text: 'Start the shed check.' });

  const created = await ctx.nixie.waitForRecord(
    (record) => record.kind === 'task.created' && record.payload['startedBy'] === 'conversation',
  );

  const taskID = created.payload['taskID'];

  invariant(typeof taskID === 'string');

  const opened = await ctx.nixie.waitForRecord(
    (record) => record.kind === 'model.session_opened' && record.thread === taskID,
  );

  await ctx.nixie.waitForRecord(
    (record) => record.kind === 'model.reply' && record.thread === taskID,
  );

  const records = await ctx.nixie.readRecords();

  await process.kill();

  const recalled = records.filter(
    (record) => record.kind === 'memory.recalled' && record.thread === taskID,
  );

  expect(opened.payload['status']).toMatchObject({ index_items: 3 });
  expect(recalled).toStrictEqual([]);
});
