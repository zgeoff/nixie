import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { buildToolRegistry } from '@heynixie/tools';
import { recallPageLimitBytes } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildMemoryTools } from './build-memory-tools';
import { buildMockProvenance } from './test-utils/build-mock-provenance';
import { readItemShortID } from './test-utils/read-item-short-id';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

async function setupTest() {
  const memory = await startTestMemory();

  const registry = buildToolRegistry(
    buildMemoryTools(memory.store, {
      clock: { now: () => Date.now() },
      ownerName: null,
      agentName: null,
      defaultZone: 'UTC',
    }),
  );

  const tool = registry.findTool('memory.recall');
  const retireTool = registry.findTool('memory.retire');

  invariant(tool);
  invariant(retireTool);

  const context = {
    run: {
      runID: 'run-1',
      thread: 'conversation',
      tools: [],
      model: { model: 'test-model', profile: 'standard' },
    },
  };

  const itemSchema = z.object({ itemID: z.string(), text: z.string(), subject: z.string() });
  const searchedSchema = z.record(z.string(), z.unknown());
  const leftOutShape = { count: z.number(), itemIDs: z.array(z.string()), versions: z.number() };

  const pageSchema = z.object({
    items: z.array(itemSchema),
    next: z.string().nullable().optional(),
    searched: searchedSchema,
    leftOut: z.object(leftOutShape).optional(),
  });

  return {
    memory,
    tool,
    recallOutcome: (input: JSONObject) =>
      tool.definition.run(
        { callID: 'call-1', tool: 'memory.recall', input, toolUseID: null },
        context,
      ),
    readPage: async (input: JSONObject) => {
      const outcome = await tool.definition.run(
        { callID: 'call-1', tool: 'memory.recall', input, toolUseID: null },
        context,
      );

      invariant(outcome.status === 'ok');

      const bytes = Buffer.byteLength(JSON.stringify(outcome.result));
      const isValid = tool.parseOutput(outcome.result);

      return { ...pageSchema.parse(outcome.result), bytes, record: outcome.record, isValid };
    },
    retireOutcome: (input: JSONObject) =>
      retireTool.definition.run(
        { callID: 'call-2', tool: 'memory.retire', input, toolUseID: null },
        context,
      ),
    readRecallRecords: () =>
      readRecords(memory.log, { afterSequence: 0, kinds: ['memory.recalled'] }),
    readUUIDs: (shortIDs: readonly string[]) => memory.store.readItemIDMap(shortIDs),
  };
}

test('it returns only the self-notes of a plain list that asks for the self subject', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({ text: 'The hose leaks', provenance: buildMockProvenance() });

  await ctx.memory.store.remember({
    text: 'I like short replies',
    subject: 'self',
    provenance: buildMockProvenance(),
  });

  const page = await ctx.readPage({ subjects: ['self'] });

  expect(page.items.map((item) => item.text)).toStrictEqual(['I like short replies']);
  expect(page.searched).toStrictEqual({ subjects: ['self'] });
});

test('it returns only the self-notes of a query that asks for the self subject', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'The garden hose leaks',
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.remember({
    text: 'I enjoy hearing about the garden',
    subject: 'self',
    provenance: buildMockProvenance(),
  });

  const page = await ctx.readPage({ query: 'garden', subjects: ['self'] });

  expect(page.items.map((item) => item.text)).toStrictEqual(['I enjoy hearing about the garden']);
  expect(page.searched).toStrictEqual({ query: 'garden', subjects: ['self'] });
});

test.each([
  ['an empty subjects list', { subjects: [] }],
  ['an unknown subject', { subjects: ['stranger'] }],
  ['a repeated subject', { subjects: ['self', 'self'] }],
  ['4 subjects', { subjects: ['owner', 'self', 'shared', 'owner'] }],
])('it refuses %s', async (_label, input) => {
  const ctx = await setupTest();

  expect(ctx.tool.parseInput(input)).toMatchObject({ isValid: false });
});

test.each([
  ['a plain list', 'owner kayak note', '寝'],
  ['a plain list of 3-byte characters', 'owner kayak note', '語'],
])(
  'it fits %s of 100 long items to the page limit and continues after the cut',
  async (_label, prefix, filler) => {
    const ctx = await setupTest();

    for (let index = 0; index < 100; index += 1) {
      await ctx.memory.store.remember({
        text: `${prefix} ${index} ${filler.repeat(1900)}`,
        provenance: buildMockProvenance(),
      });
    }

    const first = await ctx.readPage({ limit: 100 });

    const next = first.next;

    invariant(typeof next === 'string');

    const second = await ctx.readPage({ after: next });

    expect(first.bytes).toBeLessThanOrEqual(recallPageLimitBytes);
    expect(first.isValid).toStrictEqual({ isValid: true });
    expect(first.leftOut?.count).toBeGreaterThan(0);
    expect(first.leftOut?.itemIDs).toStrictEqual([]);
    expect(first.items.at(-1)?.text).toInclude(` ${first.items.length - 1} `);
    expect(second.items[0]?.text).toInclude(` ${first.items.length} `);
  },
);

test('it names the matches a query cut in rank order, and the omitted IDs read back as the next items', async () => {
  const ctx = await setupTest();

  const shortIDs: string[] = [];

  for (let index = 0; index < 30; index += 1) {
    const item = await ctx.memory.store.remember({
      text: `kayak paddle ${index} ${'x'.repeat(1950)}`,
      provenance: buildMockProvenance(),
    });

    const shortID = await readItemShortID(ctx.memory.log, item.itemID);

    shortIDs.push(shortID);
  }

  const queried = await ctx.readPage({ query: 'kayak paddle', limit: 30 });

  const omittedIDs = queried.leftOut?.itemIDs ?? [];

  const afterOmitted = await ctx.readPage({ itemIDs: omittedIDs.slice(0, 5) });
  const everyID = await ctx.readPage({ itemIDs: shortIDs, limit: 30 });

  const returned = everyID.items.map((item) => item.itemID);

  expect(queried.bytes).toBeLessThanOrEqual(recallPageLimitBytes);
  expect(omittedIDs.length).toBeGreaterThan(0);

  expect(omittedIDs).toSatisfyAll(
    (itemID: string) => !queried.items.some((item) => item.itemID === itemID),
  );

  expect(afterOmitted.items[0]?.itemID).toBe(omittedIDs[0]);
  expect([...returned, ...(everyID.leftOut?.itemIDs ?? [])]).toStrictEqual(shortIDs);
});

test('it returns the first 20 of 30 named IDs and lists the other 10 in the order named', async () => {
  const ctx = await setupTest();

  const shortIDs: string[] = [];

  for (let index = 0; index < 30; index += 1) {
    const item = await ctx.memory.store.remember({
      text: `short note ${index}`,
      provenance: buildMockProvenance(),
    });

    const shortID = await readItemShortID(ctx.memory.log, item.itemID);

    shortIDs.push(shortID);
  }

  const page = await ctx.readPage({ itemIDs: shortIDs });

  expect(page.items.map((item) => item.itemID)).toStrictEqual(shortIDs.slice(0, 20));
  expect(page.leftOut).toStrictEqual({ count: 10, itemIDs: shortIDs.slice(20), versions: 0 });
  expect(page.searched).toStrictEqual({ itemIDs: shortIDs });
});

test('it records exactly the versions of the page it returned, and sends an omitted item to review when the model retires it', async () => {
  const ctx = await setupTest();

  const items = [];

  for (let index = 0; index < 20; index += 1) {
    const item = await ctx.memory.store.remember({
      text: `kayak note ${index} ${'x'.repeat(1900)}`,
      provenance: buildMockProvenance(),
    });

    items.push(item);
  }

  const page = await ctx.readPage({ query: 'kayak note', limit: 20 });
  const records = await ctx.readRecallRecords();
  const uuids = await ctx.readUUIDs(page.items.map((item) => item.itemID));

  const omittedID = page.leftOut?.itemIDs[0];

  invariant(omittedID !== undefined);

  await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'drop the last kayak note',
    spans: [{ start: 0, end: 24, source: 'typed' }],
  });

  const retired = await ctx.retireOutcome({
    itemID: omittedID,
    version: 1,
    intentQuote: 'drop the last kayak note',
  });

  expect(records.at(-1)?.record.payload['items']).toMatchObject(
    page.items.map((item) => ({ itemID: uuids.get(item.itemID), version: 1 })),
  );

  expect(records.at(-1)?.record.payload['items']).toHaveLength(page.items.length);

  expect(retired).toMatchObject({
    status: 'ok',
    result: { status: 'proposed', reason: expect.toStartWith('ambiguous_target') },
  });
});

test('it fits one item of 40 long versions to the page limit and records only the versions it returned', async () => {
  const ctx = await setupTest();

  let version = await ctx.memory.store.remember({
    text: `version 1 ${'x'.repeat(1950)}`,
    provenance: buildMockProvenance(),
  });

  for (let index = 2; index <= 40; index += 1) {
    version = await ctx.memory.store.remember({
      text: `version ${index} ${'x'.repeat(1950)}`,
      target: version,
      provenance: buildMockProvenance(),
    });
  }

  const shortID = await readItemShortID(ctx.memory.log, version.itemID);
  const page = await ctx.readPage({ itemIDs: [shortID], includeHistory: true });
  const records = await ctx.readRecallRecords();

  const recorded = z.array(z.unknown()).parse(records.at(-1)?.record.payload['items']);

  expect(page.bytes).toBeLessThanOrEqual(recallPageLimitBytes);
  expect(page.leftOut?.versions).toBeGreaterThan(0);
  expect(page.leftOut?.count).toBe(0);
  expect(recorded).toHaveLength(40 - (page.leftOut?.versions ?? 0));
});

test.each([
  ['query with itemIDs', { query: 'kayak', itemIDs: ['k3v9x2ab1c'] }],
  ['after with query', { query: 'kayak', after: '3' }],
  ['after with itemIDs', { itemIDs: ['k3v9x2ab1c'], after: '3' }],
])('it refuses %s as an error and writes no recall record', async (_label, input) => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({ text: 'kayak note', provenance: buildMockProvenance() });

  const outcome = await ctx.recallOutcome(input);
  const records = await ctx.readRecallRecords();

  expect(outcome).toStrictEqual({ status: 'error', message: expect.toStartWith('refused:') });
  expect(records).toStrictEqual([]);
});

test('it stores the omitted item IDs in the record and keeps the searched query out of it', async () => {
  const ctx = await setupTest();

  const uuids: string[] = [];

  for (let index = 0; index < 20; index += 1) {
    const item = await ctx.memory.store.remember({
      text: `kayak note ${index} ${'x'.repeat(1900)}`,
      provenance: buildMockProvenance(),
    });

    uuids.push(item.itemID);
  }

  const page = await ctx.readPage({ query: 'kayak note', limit: 20 });

  expect(page.searched).toStrictEqual({ query: 'kayak note' });

  const leftOutSchema = z.object({
    count: z.number(),
    itemIDs: z.array(z.string()),
    versions: z.number(),
  });

  const recordedItemSchema = z.object({ itemID: z.string(), version: z.number() });

  const recordSchema = z.object({
    items: z.array(recordedItemSchema),
    next: z.null(),
    leftOut: leftOutSchema,
  });

  const record = recordSchema.parse(page.record);
  const recordedIDs = record.items.map((item) => item.itemID);
  const isKnown = (itemID: string) => uuids.includes(itemID);

  expect(recordedIDs).toSatisfyAll(isKnown);
  expect(record.leftOut.itemIDs).toSatisfyAll(isKnown);
  expect(record.leftOut.count).toBe(page.leftOut?.count ?? -1);
  expect(record.leftOut.versions).toBe(0);
  expect(record.leftOut.itemIDs).toHaveLength(page.leftOut?.itemIDs.length ?? 0);
});

test('it returns an empty items list with its search and no other key when nothing matches', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({ text: 'kayak note', provenance: buildMockProvenance() });

  const outcome = await ctx.recallOutcome({ query: 'zucchini' });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { items: [], searched: { query: 'zucchini' } },
  });

  const keys = outcome.status === 'ok' ? Object.keys(outcome.result) : [];

  expect(keys).toStrictEqual(['items', 'searched']);
});

test('it refuses an item ID longer than 64 characters before it can fill the page', async () => {
  const ctx = await setupTest();

  const longID = 'z'.repeat(21_000);

  expect(ctx.tool.parseInput({ itemIDs: [longID] }).isValid).toBe(false);
});

test('it fits the page limit when 100 unknown IDs of the longest length are named', async () => {
  const ctx = await setupTest();

  const itemIDs = Array.from({ length: 100 }, (_, index) => `${index}`.padEnd(64, 'z'));

  expect(ctx.tool.parseInput({ itemIDs }).isValid).toBe(true);

  const page = await ctx.readPage({ itemIDs });

  expect(page.bytes).toBeLessThanOrEqual(recallPageLimitBytes);
});

test('it fits the page limit when 100 unknown IDs padded with control characters are named', async () => {
  const ctx = await setupTest();

  const itemIDs = Array.from({ length: 100 }, (_, index) =>
    `${index}`.padEnd(64, String.fromCodePoint(1)),
  );

  expect(ctx.tool.parseInput({ itemIDs }).isValid).toBe(true);

  const page = await ctx.readPage({ itemIDs });

  expect(page.bytes).toBeLessThanOrEqual(recallPageLimitBytes);
  expect(page.isValid).toMatchObject({ isValid: true });
});
