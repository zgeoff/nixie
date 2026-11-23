import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { readRecordAttachments, readRecords, removeRecordKey, writeRecords } from '@heynixie/log';
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

  const writeCardRecord = async (prepared: Awaited<ReturnType<NonNullable<Tool['prepare']>>>) => {
    invariant('attachments' in prepared, 'the call is prepared');

    const [record] = await writeRecords(memory.log, [
      {
        kind: 'tool_called',
        definitions: { snapshotHash: 'sha256:aa11' },
        payload: { tool: 'memory.retopic' },
        ...(prepared.attachments === undefined ? {} : { attachments: prepared.attachments }),
      },
    ]);

    invariant(record, 'the call is recorded');

    return record.sequence;
  };

  return {
    memory,
    tool,
    createItem,
    run: (input: JSONObject, verdict: MemoryWriteVerdict = buildAllowVerdict()) =>
      tool.run(
        { callID: 'call-1', tool: 'memory.retopic', input, toolUseID: null },
        buildMockToolContext({}, verdict),
      ),
    writeCardRecord,
    writeCard: async (input: JSONObject) => {
      invariant(tool.prepare, 'memory.retopic prepares its call');

      const prepared = await tool.prepare(input, { run: buildMockToolContext().run });

      return writeCardRecord(prepared);
    },
    approve: (input: JSONObject, callSequence: number) =>
      tool.run(
        { callID: 'call-1', tool: 'memory.retopic', input, toolUseID: null },
        { ...buildMockToolContext(), callSequence },
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
    items: [{ itemID: item.itemID, id: item.shortID, gist: 'tent poles', from: 'self/lines' }],
  });
});

test.each([
  [
    'a topic that no item has',
    'EMPTY_MOVE',
    { from: { topic: 'nowhere', subject: 'owner' }, to: { topic: 'house', subject: 'owner' } },
    /no item has the topic nowhere/u,
  ],
  [
    'a move onto the same topic and subject',
    'SAME_TOPIC',
    { from: { topic: 'home', subject: 'owner' }, to: { topic: 'HOME', subject: 'owner' } },
    /already under owner\/HOME/u,
  ],
  [
    'an item that does not exist',
    'UNKNOWN_ITEM',
    { items: ['zzzzzzzzzz'], to: { topic: 'house', subject: 'owner' } },
    /no memory item zzzzzzzzzz to move/u,
  ],
  [
    'an empty list of items',
    'EMPTY_MOVE',
    { items: [], to: { topic: 'house', subject: 'owner' } },
    /pass at least one item to move/u,
  ],
  [
    'a call with both from and items',
    'EMPTY_MOVE',
    {
      from: { topic: 'home', subject: 'owner' },
      items: ['zzzzzzzzzz'],
      to: { topic: 'house', subject: 'owner' },
    },
    /either from or items/u,
  ],
  [
    'a topic that would pass 40 characters',
    'TOPIC_TOO_LONG',
    { from: { topic: 'home', subject: 'owner' }, to: { topic: 'x'.repeat(40), subject: 'owner' } },
    /longer than 40 characters/u,
  ],
])('it refuses %s with a named refusal and writes nothing', async (_name, code, input, message) => {
  const ctx = await setupTest();
  const item = await ctx.createItem({ gist: 'spare pump', topic: 'home/pumps' });
  const outcome = await ctx.run(input);
  const labels = await ctx.memory.store.writes.readItemLabels(item.itemID);

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'refused', code, message: expect.stringMatching(message) },
    refusalCode: code,
  });

  expect(labels.topic).toBe('home/pumps');
});

test('it refuses an item named by its internal ID, because only short IDs name an item', async () => {
  const ctx = await setupTest();
  const item = await ctx.createItem({ gist: 'spare pump', topic: 'home' });

  const outcome = await ctx.run({
    items: [item.itemID],
    to: { topic: 'house', subject: 'owner' },
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      status: 'refused',
      code: 'UNKNOWN_ITEM',
      message: `refused: no memory item ${item.itemID} to move`,
    },
    refusalCode: 'UNKNOWN_ITEM',
  });
});

test('it takes the refusal of a move to the decision point, so prepare stores it for the card and returns no result', async () => {
  const ctx = await setupTest();
  const item = await ctx.createItem({ gist: 'spare pump', topic: 'home/pumps' });

  const prepared = await ctx.prepare({
    from: { topic: 'home', subject: 'owner' },
    to: { topic: 'x'.repeat(39), subject: 'owner' },
  });

  invariant(
    'attachments' in prepared && prepared.attachments !== undefined,
    'the call is prepared',
  );

  const [bytes] = prepared.attachments;

  invariant(bytes, 'the call stores one attachment');

  expect(JSON.parse(new TextDecoder().decode(bytes))).toStrictEqual({
    sentence: `refused: item ${item.shortID} would take the topic ${'x'.repeat(39)}/pumps, which is longer than 40 characters`,
    items: [],
  });
});

test('it refuses a call with both from and items before the decision point', async () => {
  const ctx = await setupTest();

  const prepared = await ctx.prepare({
    from: { topic: 'home', subject: 'owner' },
    items: ['zzzzzzzzzz'],
    to: { topic: 'house', subject: 'owner' },
  });

  expect(prepared).toMatchObject({ refusalCode: 'EMPTY_MOVE', result: { status: 'refused' } });
});

test('it refuses a move that is already done for every item on the list', async () => {
  const ctx = await setupTest();
  const item = await ctx.createItem({ gist: 'spare pump', topic: 'home' });

  const outcome = await ctx.run({
    items: [item.shortID],
    to: { topic: 'home', subject: 'owner' },
  });

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      status: 'refused',
      code: 'SAME_TOPIC',
      message: 'refused: every item is already under owner/home',
    },
    refusalCode: 'SAME_TOPIC',
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
    status: 'ok',
    result: {
      status: 'refused',
      code: 'UNKNOWN_ITEM',
      message: `refused: no memory item ${second.shortID} to move`,
    },
    refusalCode: 'UNKNOWN_ITEM',
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

test('it declares the memory_write effect and gives a rule the subject, the topic and the items the call moves', async () => {
  const ctx = await setupTest();
  const first = await ctx.createItem({ gist: 'spare pump', topic: 'home' });
  const second = await ctx.createItem({ gist: 'tent poles', topic: 'trips' }, 'self');

  const tool: Tool = ctx.tool;

  const facts = await tool.resolvePolicyFacts?.(
    { items: [first.shortID, second.shortID], to: { topic: 'house', subject: 'shared' } },
    { run: buildMockToolContext().run },
  );

  expect(tool.declaration.effects).toStrictEqual(['memory_write']);

  expect(facts).toStrictEqual({
    status: 'ok',
    sources: ['outside'],
    args: {
      items: [first.shortID, second.shortID],
      to: { topic: 'house', subject: 'shared' },
      subject: ['shared', 'owner', 'self'],
      topic: 'house',
      itemID: [first.shortID, second.shortID],
    },
  });
});

test('it gives a rule on memory.edit the subject of a whole-topic move as one value', async () => {
  const ctx = await setupTest();
  const item = await ctx.createItem({ gist: 'spare pump', topic: 'home' });

  const facts = await ctx.tool.resolvePolicyFacts?.(
    { from: { topic: 'home', subject: 'owner' }, to: { topic: 'diary', subject: 'owner' } },
    { run: buildMockToolContext().run },
  );

  expect(facts).toMatchObject({
    status: 'ok',
    args: { subject: 'owner', topic: 'diary', itemID: [item.shortID] },
  });
});

test('it moves what the card showed when the user approves the call', async () => {
  const ctx = await setupTest();
  const item = await ctx.createItem({ gist: 'spare pump', topic: 'home' });

  const input = {
    from: { topic: 'home', subject: 'owner' },
    to: { topic: 'house', subject: 'owner' },
  };

  const sequence = await ctx.writeCard(input);
  const outcome = await ctx.approve(input, sequence);
  const labels = await ctx.memory.store.writes.readItemLabels(item.itemID);

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { status: 'applied', moved: 1, move: 'owner/home → owner/house, 1 item' },
  });

  expect(labels.topic).toBe('house');
});

test('it refuses an approved move of a topic that took an item after the card showed it, and moves nothing', async () => {
  const ctx = await setupTest();
  const shown = await ctx.createItem({ gist: 'spare pump', topic: 'home' });

  const input = {
    from: { topic: 'home', subject: 'owner' },
    to: { topic: 'house', subject: 'owner' },
  };

  const sequence = await ctx.writeCard(input);
  const added = await ctx.createItem({ gist: 'piano tuned', topic: 'home' });
  const outcome = await ctx.approve(input, sequence);

  const labels = await Promise.all(
    [shown, added].map((item) => ctx.memory.store.writes.readItemLabels(item.itemID)),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      status: 'refused',
      code: 'CHANGED_SINCE_SHOWN',
      message:
        'refused: the items of this move changed after the card showed them, so ask for the move again',
    },
    refusalCode: 'CHANGED_SINCE_SHOWN',
  });

  expect(labels.map((entry) => entry.topic)).toStrictEqual(['home', 'home']);
});

test('it refuses an approved move whose card is gone', async () => {
  const ctx = await setupTest();

  await ctx.createItem({ gist: 'spare pump', topic: 'home' });

  const input = {
    from: { topic: 'home', subject: 'owner' },
    to: { topic: 'house', subject: 'owner' },
  };

  const outcome = await ctx.approve(input, 999);

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      status: 'refused',
      code: 'CHANGED_SINCE_SHOWN',
      message: 'refused: the card of this move is gone, so ask for the move again',
    },
    refusalCode: 'CHANGED_SINCE_SHOWN',
  });
});

test('it moves a self-note for a task after the user approved it, with no rule', async () => {
  const ctx = await setupTest();
  const item = await ctx.createItem({ gist: 'tent poles', topic: 'lines' }, 'self');

  const input = { items: [item.shortID], to: { topic: 'diary', subject: 'owner' } };

  const sequence = await ctx.writeCard(input);

  const outcome = await ctx.tool.run(
    { callID: 'call-1', tool: 'memory.retopic', input, toolUseID: null },
    { ...buildMockToolContext({ thread: 'task-1' }), callSequence: sequence },
  );

  expect(outcome).toMatchObject({ status: 'ok' });
});

test('it writes one record for each item it moves, whether or not the item changes subject', async () => {
  const ctx = await setupTest();
  const same = await ctx.createItem({ gist: 'spare pump', topic: 'home' });
  const across = await ctx.createItem({ gist: 'tent poles', topic: 'home' });

  await ctx.run({ items: [same.shortID], to: { topic: 'house', subject: 'owner' } });
  await ctx.run({ items: [across.shortID], to: { topic: 'house', subject: 'shared' } });

  const records = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['memory.labelled', 'memory.subject_changed'],
    limit: 100,
  });

  const subject = await ctx.memory.store.writes.readItemSubject(across.itemID);

  expect(
    records
      .filter((entry) => entry.record.payload['change'] === 'edited')
      .map((entry) => [entry.record.kind, entry.record.payload['itemID']]),
  ).toStrictEqual([
    ['memory.labelled', same.itemID],
    ['memory.labelled', across.itemID],
  ]);

  expect(records.map((entry) => entry.record.kind)).not.toContain('memory.subject_changed');
  expect(subject).toBe('shared');
});

test('it gives a rule the topic each item of a whole-topic move lands under', async () => {
  const ctx = await setupTest();

  await ctx.createItem({ gist: 'spare pump', topic: 'notes' });
  await ctx.createItem({ gist: 'piano tuned', topic: 'notes/private' });

  const facts = await ctx.tool.resolvePolicyFacts?.(
    { from: { topic: 'notes', subject: 'owner' }, to: { topic: 'diary', subject: 'owner' } },
    { run: buildMockToolContext().run },
  );

  expect(facts).toMatchObject({ status: 'ok', args: { topic: ['diary', 'diary/private'] } });
});

test('it erases the card of a call that was stored after an item it names was forgotten', async () => {
  const ctx = await setupTest();
  const item = await ctx.createItem({ gist: 'spare pump', topic: 'home' });

  const prepared = await ctx.prepare({
    items: [item.shortID],
    to: { topic: 'house', subject: 'owner' },
  });

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const sequence = await ctx.writeCardRecord(prepared);

  invariant('settleAttachments' in prepared, 'the call settles its card');

  await prepared.settleAttachments?.(sequence);

  const attachments = await readRecordAttachments(ctx.memory.log, [sequence]);

  expect(attachments.get(sequence)).toStrictEqual({ status: 'shredded' });
});

test('it moves a sub-topic whose name changes length when lower-cased, keeping the name the item spells', async () => {
  const ctx = await setupTest();
  const item = await ctx.createItem({ gist: 'spare pump', topic: 'İ/garden' });

  await ctx.run({
    from: { topic: 'i\u0307', subject: 'owner' },
    to: { topic: 'house', subject: 'owner' },
  });

  const labels = await ctx.memory.store.writes.readItemLabels(item.itemID);

  expect(labels.topic).toBe('house/garden');
});

test('it removes the stored card of a held move when an item it names is forgotten', async () => {
  const ctx = await setupTest();
  const item = await ctx.createItem({ gist: 'spare pump', topic: 'home' });
  const other = await ctx.createItem({ gist: 'tent poles', topic: 'trips' });

  const held = await ctx.writeCard({
    items: [item.shortID],
    to: { topic: 'house', subject: 'owner' },
  });

  const kept = await ctx.writeCard({
    items: [other.shortID],
    to: { topic: 'house', subject: 'owner' },
  });

  await ctx.memory.store.forget({
    target: item,
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const attachments = await readRecordAttachments(ctx.memory.log, [held, kept]);

  expect(attachments.get(held)).toStrictEqual({ status: 'shredded' });
  expect(attachments.get(kept)).toMatchObject({ status: 'readable' });
});

test.each([
  { from: 'owner', to: 'self' },
  { from: 'self', to: 'owner' },
  { from: 'self', to: 'shared' },
] as const)(
  'it refuses a granted task a move from $from to $to before the decision point, so no approval card is made',
  async (move) => {
    const ctx = await setupTest();
    const item = await ctx.createItem({ gist: 'tent poles', topic: 'lines' }, move.from);

    const facts = await ctx.tool.resolvePolicyFacts?.(
      { items: [item.shortID], to: { topic: 'lines', subject: move.to } },
      buildMockToolContext({ thread: 'task-1', hasSelfNoteGrant: true }),
    );

    expect(facts).toMatchObject({
      status: 'error',
      message: expect.toInclude('grants it self-note writes only'),
    });
  },
);

test('it lets the facts of a granted task move of self-notes to another self topic through', async () => {
  const ctx = await setupTest();
  const item = await ctx.createItem({ gist: 'tent poles', topic: 'lines' }, 'self');

  const facts = await ctx.tool.resolvePolicyFacts?.(
    { items: [item.shortID], to: { topic: 'diary', subject: 'self' } },
    buildMockToolContext({ thread: 'task-1', hasSelfNoteGrant: true }),
  );

  expect(facts).toMatchObject({ status: 'ok', sources: ['outside', 'task'] });
});
