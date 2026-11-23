import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { readRecords, removeRecordKey } from '@heynixie/log';
import type { MemoryWriteVerdict, ToolDefinition } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import {
  buildAllowVerdict,
  createMemoryItem,
  readItemShortID,
  startTestMemory,
} from '../test-utils';
import { buildMockToolContext } from '../test-utils/build-mock-tool-context';
import type { Labels, MemorySubject } from '../types';
import { buildRetopicTool } from './build-retopic-tool';

async function setupTest() {
  const memory = await startTestMemory();

  const tool = buildRetopicTool(memory.store);

  const createItem = async (labels: Pick<Labels, 'gist' | 'topic'>, subject?: MemorySubject) => {
    const item = await createMemoryItem(memory.store, {
      text: `Fact: ${labels.gist}`,
      labels: { ...labels, triggers: [] },
      ...(subject === undefined ? {} : { subject }),
    });

    return { ...item, shortID: await readItemShortID(memory.log, item.itemID) };
  };

  return {
    memory,
    tool,
    createItem,
    run: (input: JSONObject, verdict?: MemoryWriteVerdict) =>
      tool.run(
        { callID: 'call-1', tool: 'memory.retopic', input, toolUseID: null },
        buildMockToolContext({}, verdict),
      ),
    prepare: (input: JSONObject) => {
      invariant(tool.prepare, 'memory.retopic prepares its call');

      return tool.prepare(input, { run: buildMockToolContext().run });
    },
  };
}

type Tool = ToolDefinition;

test('it moves a whole topic and the sub-topics under it in one call, and reads the new topics back', async () => {
  const ctx = await setupTest();
  const first = await ctx.createItem({ gist: 'spare pump', topic: 'home' });
  const second = await ctx.createItem({ gist: 'piano tuned', topic: 'Home/garden' });
  const other = await ctx.createItem({ gist: 'tent poles', topic: 'trips' });

  const outcome = await ctx.run({
    from: { topic: 'home', subject: 'owner' },
    to: { topic: 'house', subject: 'owner' },
  });

  const labels = await Promise.all(
    [first, second, other].map((item) => ctx.memory.store.writes.readItemLabels(item.itemID)),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', moved: 2, move: 'owner/home → owner/house, 2 items' },
  });

  expect(labels.map((entry) => entry.topic)).toStrictEqual(['house', 'house/garden', 'trips']);

  expect(labels.map((entry) => entry.gist)).toStrictEqual([
    'spare pump',
    'piano tuned',
    'tent poles',
  ]);
});

test('it writes one label record per moved item and no version, so the text never changes', async () => {
  const ctx = await setupTest();
  const first = await ctx.createItem({ gist: 'spare pump', topic: 'home' });
  const second = await ctx.createItem({ gist: 'piano tuned', topic: 'home' });

  await ctx.run({
    from: { topic: 'home', subject: 'owner' },
    to: { topic: 'house', subject: 'owner' },
  });

  const edited = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.labelled'],
    limit: 100,
  });

  const versions = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.version_added'],
    limit: 100,
  });

  expect(
    edited
      .filter((entry) => entry.record.payload['change'] === 'edited')
      .map((entry) => entry.record.payload['itemID']),
  ).toStrictEqual([first.itemID, second.itemID]);

  expect(versions).toHaveLength(2);
});

test('it moves the items a list of short IDs names to the topic and subject in to', async () => {
  const ctx = await setupTest();
  const first = await ctx.createItem({ gist: 'spare pump', topic: 'home' });
  const second = await ctx.createItem({ gist: 'tent poles', topic: 'trips' });
  const left = await ctx.createItem({ gist: 'piano tuned', topic: 'home' });

  const outcome = await ctx.run({
    items: [first.shortID, second.shortID],
    to: { topic: 'garage', subject: 'shared' },
  });

  const subjects = await Promise.all(
    [first, second, left].map((item) => ctx.memory.store.writes.readItemSubject(item.itemID)),
  );

  const labels = await Promise.all(
    [first, second, left].map((item) => ctx.memory.store.writes.readItemLabels(item.itemID)),
  );

  const topics = labels.map((entry) => entry.topic);

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', moved: 2, move: '2 topics → shared/garage, 2 items' },
  });

  expect(subjects).toStrictEqual(['shared', 'shared', 'owner']);
  expect(topics).toStrictEqual(['garage', 'garage', 'home']);
});

test('it names the move and each item with its gist in what it stores for the approval card', async () => {
  const ctx = await setupTest();
  const item = await ctx.createItem({ gist: 'tent poles', topic: 'lines' }, 'self');

  const prepared = await ctx.prepare({
    items: [item.shortID],
    to: { topic: 'diary', subject: 'self' },
  });

  invariant(
    'attachments' in prepared && prepared.attachments !== undefined,
    'the call is prepared',
  );

  const [bytes] = prepared.attachments;

  invariant(bytes, 'the call stores one attachment');

  expect(JSON.parse(new TextDecoder().decode(bytes))).toStrictEqual({
    sentence: 'self/lines → self/diary, 1 item',
    items: [{ id: item.shortID, gist: 'tent poles', from: 'self/lines' }],
  });
});

test.each([
  [
    'a topic that no item has',
    { from: { topic: 'nowhere', subject: 'owner' }, to: { topic: 'house', subject: 'owner' } },
    'EMPTY_MOVE',
    /no item has the topic nowhere/u,
  ],
  [
    'a move onto the same topic and subject',
    { from: { topic: 'home', subject: 'owner' }, to: { topic: 'HOME', subject: 'owner' } },
    'SAME_TOPIC',
    /already under owner\/HOME/u,
  ],
  [
    'an item that does not exist',
    { items: ['zzzzzzzzzz'], to: { topic: 'house', subject: 'owner' } },
    'UNKNOWN_ITEM',
    /no memory item zzzzzzzzzz to move/u,
  ],
  [
    'a call with both from and items',
    {
      from: { topic: 'home', subject: 'owner' },
      items: ['zzzzzzzzzz'],
      to: { topic: 'house', subject: 'owner' },
    },
    'EMPTY_MOVE',
    /either from or items/u,
  ],
  [
    'a topic that would pass 40 characters',
    { from: { topic: 'home', subject: 'owner' }, to: { topic: 'x'.repeat(40), subject: 'owner' } },
    'TOPIC_TOO_LONG',
    /longer than 40 characters/u,
  ],
])('it refuses %s with a named refusal and writes nothing', async (_name, input, code, message) => {
  const ctx = await setupTest();
  const item = await ctx.createItem({ gist: 'spare pump', topic: 'home/pumps' });
  const outcome = await ctx.run(input);
  const prepared = await ctx.prepare(input);
  const labels = await ctx.memory.store.writes.readItemLabels(item.itemID);

  expect(outcome).toStrictEqual({ status: 'error', message: expect.stringMatching(message) });
  expect(prepared).toMatchObject({ refusalCode: code, result: { status: 'refused' } });
  expect(labels.topic).toBe('home/pumps');
});

test('it refuses a move that is already done for every item on the list', async () => {
  const ctx = await setupTest();
  const item = await ctx.createItem({ gist: 'spare pump', topic: 'home' });

  const outcome = await ctx.run({
    items: [item.shortID],
    to: { topic: 'home', subject: 'owner' },
  });

  expect(outcome).toStrictEqual({
    status: 'error',
    message: 'refused: every item is already under owner/home',
  });
});

test('it leaves an item that is already under the target out of the move and counts the rest', async () => {
  const ctx = await setupTest();
  const there = await ctx.createItem({ gist: 'spare pump', topic: 'house' });
  const here = await ctx.createItem({ gist: 'piano tuned', topic: 'home' });

  const outcome = await ctx.run({
    items: [there.shortID, here.shortID],
    to: { topic: 'house', subject: 'owner' },
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', moved: 1, move: 'owner/home → owner/house, 1 item' },
  });
});

test('it keeps every item in place when one item fails mid-move, records and label entries alike', async () => {
  const ctx = await setupTest();
  const first = await ctx.createItem({ gist: 'spare pump', topic: 'home' });
  const second = await ctx.createItem({ gist: 'piano tuned', topic: 'home' });

  await removeRecordKey(ctx.memory.log, second.itemID);

  const outcome = await ctx.run({
    from: { topic: 'home', subject: 'owner' },
    to: { topic: 'house', subject: 'owner' },
  });

  const labelled = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.labelled'],
    limit: 100,
  });

  const labels = await ctx.memory.store.writes.readItemLabels(first.itemID);

  expect(outcome).toStrictEqual({
    status: 'error',
    message: `refused: no memory item ${second.shortID} to move`,
  });

  expect(labels.topic).toBe('home');
  expect(labelled.filter((entry) => entry.record.payload['change'] === 'edited')).toStrictEqual([]);
});

test('it applies a move under an allow rule that covers it, and refuses a move into self when the rule checks no subject', async () => {
  const ctx = await setupTest();
  const item = await ctx.createItem({ gist: 'spare pump', topic: 'home' });

  const covered = await ctx.run(
    { items: [item.shortID], to: { topic: 'house', subject: 'owner' } },
    buildAllowVerdict(),
  );

  const uncovered = await ctx.run(
    { items: [item.shortID], to: { topic: 'notes', subject: 'self' } },
    buildAllowVerdict(),
  );

  const checked = await ctx.run(
    { items: [item.shortID], to: { topic: 'notes', subject: 'self' } },
    buildAllowVerdict([{ arg: 'subject', op: 'eq', value: 'self' }]),
  );

  expect(covered).toMatchObject({ status: 'ok' });

  expect(uncovered).toStrictEqual({
    status: 'error',
    message: 'a move that touches a self-note needs an allow rule that checks subject eq self',
  });

  expect(checked).toMatchObject({ status: 'ok' });
});

test('it declares the memory_write effect and takes the subject a call moves to as its rule subject', async () => {
  const ctx = await setupTest();

  const tool: Tool = ctx.tool;

  const facts = await tool.resolvePolicyFacts?.(
    { items: ['a'], to: { topic: 'house', subject: 'shared' } },
    { run: buildMockToolContext().run },
  );

  expect(tool.declaration.effects).toStrictEqual(['memory_write']);

  expect(facts).toStrictEqual({
    status: 'ok',
    sources: ['outside'],
    args: { items: ['a'], to: { topic: 'house', subject: 'shared' }, subject: 'shared' },
  });
});
