import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import type { JSONObject } from '@heynixie/log';
import { createMemoryItem, startNextTestMemory, startTestMemory } from '../test-utils';
import { buildMockToolContext } from '../test-utils/build-mock-tool-context';
import { buildFoldTool } from './build-fold-tool';

async function setupTest() {
  const memory = await startTestMemory({ index: { openTopicItems: 2 } });

  const tool = buildFoldTool(memory.store);

  return {
    memory,
    createItems: async (topic: string, count: number) => {
      for (let index = 1; index <= count; index += 1) {
        await createMemoryItem(memory.store, {
          text: `Fact ${topic} ${String(index)}`,
          labels: { gist: `${topic} gist ${String(index)}`, topic, triggers: [] },
        });
      }
    },
    run: (input: JSONObject) =>
      tool.run(
        { callID: 'call-1', tool: 'memory.fold', input, toolUseID: null },
        buildMockToolContext(),
      ),
  };
}

test('it makes the index show the 3 oldest items of a folded topic, and the default is the newest', async () => {
  const ctx = await setupTest();

  await ctx.createItems('garden', 5);

  const before = await ctx.memory.store.readIndex();
  const outcome = await ctx.run({ topic: 'Garden', subject: 'owner', order: 'oldest' });
  const after = await ctx.memory.store.readIndex();

  expect(before.text).toInclude('newest: [');
  expect(before.text).toInclude('garden gist 5');

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', topic: 'garden', order: 'oldest' },
  });

  expect(after.text).toInclude('oldest: [');
  expect(after.text).toInclude('garden gist 1');
  expect(after.text).not.toInclude('garden gist 5');
});

test('it keeps the order across a restart of the store, from the records alone', async () => {
  const ctx = await setupTest();

  await ctx.createItems('garden', 5);
  await ctx.run({ topic: 'garden', subject: 'owner', order: 'oldest' });

  const next = await startNextTestMemory(ctx.memory, { index: { openTopicItems: 2 } });
  const index = await next.store.readIndex();

  expect(index.text).toInclude('oldest: [');
});

test('it lets a later setting replace an earlier one, and sets it back to the newest', async () => {
  const ctx = await setupTest();

  await ctx.createItems('garden', 5);
  await ctx.run({ topic: 'garden', subject: 'owner', order: 'oldest' });
  await ctx.run({ topic: 'garden', subject: 'owner', order: 'newest' });

  const index = await ctx.memory.store.readIndex();

  expect(index.text).toInclude('newest: [');
  expect(index.text).not.toInclude('oldest');
});

test('it stores the topic only in the erasable fields of the record', async () => {
  const ctx = await setupTest();

  await ctx.createItems('garden', 3);
  await ctx.run({ topic: 'garden', subject: 'owner', order: 'oldest' });

  const [entry] = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.fold_ordered'],
  });

  expect(entry?.record.payload).toStrictEqual({ subject: 'owner', order: 'oldest' });
  expect(entry?.record.erasable).toStrictEqual({ status: 'readable', fields: { topic: 'garden' } });
});

test.each([
  [
    'a topic no item has under the subject',
    { topic: 'garden', subject: 'shared', order: 'oldest' },
    'refused: no item has the topic garden under the subject shared',
  ],
  [
    'a sub-topic',
    { topic: 'garden/beds', subject: 'owner', order: 'oldest' },
    'refused: pass the topic before its first slash, as the order covers its sub-topics',
  ],
])('it refuses %s and writes no record', async (_name, input, message) => {
  const ctx = await setupTest();

  await ctx.createItems('garden', 3);

  const outcome = await ctx.run(input);

  const records = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.fold_ordered'],
  });

  expect(outcome).toStrictEqual({ status: 'error', message });
  expect(records).toStrictEqual([]);
});

test('it removes the fold order of a topic with the forget of its last item, and keeps it while another item holds the topic', async () => {
  const ctx = await setupTest();

  const first = await createMemoryItem(ctx.memory.store, {
    text: 'Fact garden 1',
    labels: { gist: 'garden gist 1', topic: 'garden', triggers: [] },
  });

  const last = await createMemoryItem(ctx.memory.store, {
    text: 'Fact garden 2',
    labels: { gist: 'garden gist 2', topic: 'Garden/beds', triggers: [] },
  });

  await ctx.run({ topic: 'garden', subject: 'owner', order: 'oldest' });

  const provenance = {
    origin: 'owner',
    source: 'owner',
    taskID: null,
    proposalID: null,
    checks: null,
  } as const;

  await ctx.memory.store.forget({ target: first, provenance });

  const kept = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.fold_ordered'],
  });

  await ctx.memory.store.forget({ target: last, provenance });

  const removed = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.fold_ordered'],
  });

  expect(kept.map((entry) => entry.record.erasable)).toStrictEqual([
    { status: 'readable', fields: { topic: 'garden' } },
  ]);

  expect(removed.map((entry) => entry.record.erasable)).toStrictEqual([{ status: 'shredded' }]);
});

test.each(['owner', 'shared'] as const)(
  'it refuses a granted task a fold of a %s topic',
  async (subject) => {
    const ctx = await setupTest();

    await ctx.createItems('garden', 3);

    const outcome = await buildFoldTool(ctx.memory.store).run(
      {
        callID: 'call-1',
        tool: 'memory.fold',
        input: { topic: 'garden', subject, order: 'oldest' },
        toolUseID: null,
      },
      buildMockToolContext({ thread: 'task-1', hasSelfNoteGrant: true }),
    );

    expect(outcome).toMatchObject({
      status: 'error',
      message: expect.toInclude('grants it self-note writes only'),
    });
  },
);
