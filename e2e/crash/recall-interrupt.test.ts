import { expect, onTestFinished, test } from 'bun:test';
import { readTestSessionDeliveries, startSpawnedNixie } from '@heynixie/server/test-utils';
import { z } from 'zod';

async function setupTest() {
  const nixie = await startSpawnedNixie({ memoryWriter: true });

  return { nixie };
}

test('it counts only the recall whose result reached the model as held when its turn is interrupted at a later recall', async () => {
  const ctx = await setupTest();

  const first = ctx.nixie.harness.start();

  await first.ready;

  await ctx.nixie.waitForQueueCheck();

  ctx.nixie.writerModel.addReplies({ text: 'Nothing to stage.' }, { text: 'Nothing to stage.' });

  ctx.nixie.checkerModel.addReplies(
    { toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } } },
    { toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } } },
  );

  const heldRecall = Promise.withResolvers<void>();

  onTestFinished(() => {
    heldRecall.resolve();
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
    {
      toolUse: {
        name: 'mcp__nixie__memory_remember',
        input: {
          subject: 'owner',
          text: 'Your bakery is called Crumb Corner.',
          quote: 'bakery is called Crumb Corner',
        },
      },
    },
    { text: 'Saved both.' },
    { toolUse: { name: 'mcp__nixie__memory_recall', input: { query: 'dentist Marsh Lane' } } },
    {
      toolUse: { name: 'mcp__nixie__memory_recall', input: { query: 'bakery Crumb Corner' } },
      gate: heldRecall.promise,
    },

    // The CLI sends the first request of a session resumed after an interrupt twice, and answers
    // from the second.
    { text: 'Interrupted.' },
    { text: 'Interrupted.' },
  );

  await first.request('sendMessage', {
    thread: 'conversation',
    text: 'My dentist is on Marsh Lane and my bakery is called Crumb Corner',
  });

  await ctx.nixie.waitForRecord(
    (record) => record.kind === 'task.step_committed' && record.stepKey === 'conversation:1',
  );

  const items = await ctx.nixie.readMemoryItems();

  void first.request('sendMessage', { thread: 'conversation', text: 'What do you remember?' });

  // The 4th request carries the first recall's result back to the model.
  await ctx.nixie.waitForModelCalls(5);
  await first.request('arm', { point: 'memory.recall.checked' });

  heldRecall.resolve();

  const arrival = await first.waitForArrival('memory.recall.checked');

  await first.request('controlTask', { taskID: 'conversation', control: 'interrupt' });

  first.release(arrival);

  await ctx.nixie.waitForRecord(
    (record) => record.kind === 'task.step_committed' && record.stepKey === 'conversation:2',
  );

  await first.kill();

  const delivered = await readTestSessionDeliveries(
    ctx.nixie.dataDir,
    ctx.nixie.deploymentKey,
    'conversation',
  );

  const records = await ctx.nixie.readRecords();

  const recalls = records.filter((record) => record.kind === 'memory.recalled');

  const heldItems = z
    .array(z.object({ itemID: z.string() }))
    .parse(recalls.at(-1)?.payload['items']);

  const readItems = z
    .array(z.object({ itemID: z.string() }))
    .parse(recalls.at(-2)?.payload['items']);

  expect(items).toHaveLength(2);

  const deliveredIDs = delivered.versions.map((ref) => ref.itemID);

  expect(deliveredIDs).toIncludeAllMembers(readItems.map((item) => item.itemID));
  expect(deliveredIDs).not.toIncludeAnyMembers(heldItems.map((item) => item.itemID));
});
