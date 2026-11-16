import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { readRecords } from '@heynixie/log';
import { buildToolRegistry } from '@heynixie/tools';
import { recallPageLimitBytes } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { defaultGateLimits } from '../gate/default-gate-limits';
import { buildMemoryTools } from '../memory/build-memory-tools';
import type { TestMemoryOptions } from '../test-utils';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { buildMockWriteCaller } from '../test-utils/build-mock-write-caller';
import { readItemShortID } from '../test-utils/read-item-short-id';
import { startTestMemory } from '../test-utils/start-test-memory';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';

async function setupTest(config: TestMemoryOptions = {}) {
  const memory = await startTestMemory(config);

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

  const revisionSchema = z.object({ revision: z.number() });

  const itemSchema = z.object({
    itemID: z.string(),
    text: z.string(),
    subject: z.string(),
    labelHistory: z.array(revisionSchema).default([]),
  });

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

      return {
        ...pageSchema.parse(outcome.result),
        bytes,
        record: outcome.record,
        hidden: outcome.hidden,
        isValid,
      };
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

test('it fits one item with 60 label edits to the page limit and keeps its newest label revision', async () => {
  const ctx = await setupTest({
    gate: { limits: { ...defaultGateLimits, proposalCap: 100 } },
  });

  const item = await ctx.memory.store.remember({
    text: 'The piano is tuned each March by the same tuner',
    labels: { gist: 'piano tuned each March', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const triggers = ['p', 'q', 'r', 's', 't'].map((letter) => letter.repeat(60));

  for (let index = 1; index <= 60; index += 1) {
    await ctx.memory.store.writes.editLabels({
      target: { itemID: item.itemID, version: index },
      labels: { gist: `${'g'.repeat(70)} ${index}`, topic: 'home', triggers },
      caller: buildMockWriteCaller(),
    });

    const [proposal] = await ctx.memory.store.proposals.listPending();

    invariant(proposal);

    await ctx.memory.store.proposals.approve({
      proposalID: proposal.proposalID,
      actionHash: proposal.actionHash,
      identityID: 'host',
    });
  }

  const shortID = await readItemShortID(ctx.memory.log, item.itemID);
  const page = await ctx.readPage({ itemIDs: [shortID], includeHistory: true });

  expect(page.bytes).toBeLessThanOrEqual(recallPageLimitBytes);
  expect(page.leftOut?.versions).toBeGreaterThan(0);
  expect(page.items[0]?.labelHistory.at(-1)).toMatchObject({ revision: 61 });
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

test('it stores the short IDs of the shown and omitted items in the record, maps them to UUIDs under hidden, and keeps the searched query out of it', async () => {
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
  const shownIDs = page.items.map((item) => item.itemID);
  const shortIDs = [...recordedIDs, ...record.leftOut.itemIDs];

  const expectedUUIDs = await ctx.readUUIDs(shortIDs);

  expect(recordedIDs).toStrictEqual(shownIDs);
  expect(page.hidden).toStrictEqual({ uuids: Object.fromEntries(expectedUUIDs) });
  expect([...expectedUUIDs.values()]).toSatisfyAll((uuid: string) => uuids.includes(uuid));
  expect(expectedUUIDs.size).toBe(20);
  expect(JSON.stringify(record)).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-/u);
  expect(record.leftOut.count).toBe(page.leftOut?.count ?? -1);
  expect(record.leftOut.versions).toBe(0);
  expect(record.leftOut.itemIDs).toHaveLength(page.leftOut?.itemIDs.length ?? 0);
});

test('it stores no hidden field when a recall maps no item', async () => {
  const ctx = await setupTest();
  const page = await ctx.readPage({ query: 'kayak note' });

  expect(page.hidden).toBeUndefined();
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

test('it returns an empty topic page with its search and no recall record when no item holds the topic', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'The hose leaks',
    labels: { gist: 'hose leaks', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const outcome = await ctx.recallOutcome({ topic: 'garden' });
  const records = await ctx.readRecallRecords();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: { lines: [], next: null, searched: { topic: 'garden' } },
    record: { lines: [], next: null },
  });

  invariant(outcome.status === 'ok');

  expect(ctx.tool.parseOutput(outcome.result)).toStrictEqual({ isValid: true });
  expect(records).toStrictEqual([]);
});

test('it lists the gist of each item under a topic and its sub-topics, ignoring case, newest first', async () => {
  const ctx = await setupTest();

  const gists = [
    ['People/Friends', 'old friend'],
    ['people', 'general note'],
    ['people/friends/close', 'close friend'],
    ['peopleish', 'not under people'],
  ] as const;

  for (const [topic, gist] of gists) {
    await ctx.memory.store.remember({
      text: `Fact: ${gist}`,
      labels: { gist, topic, triggers: [] },
      provenance: buildMockProvenance(),
    });
  }

  const outcome = await ctx.recallOutcome({ topic: 'PEOPLE' });

  invariant(outcome.status === 'ok');

  expect(outcome.result).toStrictEqual({
    lines: [
      { itemID: expect.toBeString(), gist: 'close friend', subject: 'owner' },
      { itemID: expect.toBeString(), gist: 'general note', subject: 'owner' },
      { itemID: expect.toBeString(), gist: 'old friend', subject: 'owner' },
    ],
    next: null,
    searched: { topic: 'PEOPLE' },
  });
});

test('it narrows a topic page to the subjects the call names', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'Likes the garden',
    labels: { gist: 'likes the garden', topic: 'garden', triggers: [] },
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.remember({
    text: 'I like to hear about gardens',
    subject: 'self',
    labels: { gist: 'hears about gardens', topic: 'garden', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const outcome = await ctx.recallOutcome({ topic: 'garden', subjects: ['self'] });

  invariant(outcome.status === 'ok');

  expect(outcome.result).toStrictEqual({
    lines: [{ itemID: expect.toBeString(), gist: 'hears about gardens', subject: 'self' }],
    next: null,
    searched: { topic: 'garden', subjects: ['self'] },
  });
});

test('it leaves a pinned item out of a topic page', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'Lives on Elm Street',
    isPinned: true,
    labels: { gist: 'lives on Elm Street', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const outcome = await ctx.recallOutcome({ topic: 'home' });

  invariant(outcome.status === 'ok');

  expect(outcome.result).toMatchObject({ lines: [] });
});

test('it ends a topic page at the topic page size with the omitted count and a next that the following call starts at', async () => {
  const ctx = await setupTest({ index: { topicPage: 2 } });

  for (const gist of ['one', 'two', 'three', 'four', 'five']) {
    await ctx.memory.store.remember({
      text: `Fact ${gist}`,
      labels: { gist, topic: 'garden', triggers: [] },
      provenance: buildMockProvenance(),
    });
  }

  const first = await ctx.recallOutcome({ topic: 'garden' });
  const second = await ctx.recallOutcome({ topic: 'garden', after: '2' });
  const last = await ctx.recallOutcome({ topic: 'garden', after: '4' });

  invariant(first.status === 'ok' && second.status === 'ok' && last.status === 'ok');

  expect(first.result).toStrictEqual({
    lines: [
      { itemID: expect.toBeString(), gist: 'five', subject: 'owner' },
      { itemID: expect.toBeString(), gist: 'four', subject: 'owner' },
    ],
    next: '2',
    searched: { topic: 'garden' },
    leftOut: { count: 3, itemIDs: [], versions: 0 },
  });

  expect(second.result).toStrictEqual({
    lines: [
      { itemID: expect.toBeString(), gist: 'three', subject: 'owner' },
      { itemID: expect.toBeString(), gist: 'two', subject: 'owner' },
    ],
    next: '4',
    searched: { topic: 'garden' },
    leftOut: { count: 1, itemIDs: [], versions: 0 },
  });

  expect(last.result).toStrictEqual({
    lines: [{ itemID: expect.toBeString(), gist: 'one', subject: 'owner' }],
    next: null,
    searched: { topic: 'garden' },
  });
});

test('it cuts a topic page to the page limit in bytes and continues from the first entry it left out', async () => {
  const ctx = await setupTest({ index: { topicPage: 400 } });

  for (let count = 0; count < 260; count += 1) {
    await ctx.memory.store.remember({
      text: `Fact ${String(count)}`,
      labels: {
        gist: `${String(count).padStart(3, '0')} ${'w'.repeat(76)}`,
        topic: 'garden',
        triggers: [],
      },
      provenance: buildMockProvenance(),
    });
  }

  const first = await ctx.recallOutcome({ topic: 'garden' });

  invariant(first.status === 'ok');

  const lineSchema = z.object({ gist: z.string() });
  const pageSchema = z.object({ lines: z.array(lineSchema), next: z.string() });
  const page = pageSchema.parse(first.result);

  const second = await ctx.recallOutcome({ topic: 'garden', after: page.next });

  invariant(second.status === 'ok');

  const secondPage = pageSchema.omit({ next: true }).parse(second.result);

  expect(Buffer.byteLength(JSON.stringify(first.result))).toBeLessThanOrEqual(recallPageLimitBytes);
  expect(page.lines.length).toBeLessThan(260);
  expect(page.lines.length).toBeGreaterThan(100);

  expect(first.result).toMatchObject({
    leftOut: { count: 260 - page.lines.length, itemIDs: [], versions: 0 },
  });

  expect(page.next).toBe(String(page.lines.length));
  expect(page.lines.at(0)?.gist.slice(0, 3)).toBe('259');

  expect(secondPage.lines.at(0)?.gist.slice(0, 3)).toBe(
    String(259 - page.lines.length).padStart(3, '0'),
  );
});

test('it stores the short IDs of a topic page in its record and the UUIDs only under hidden', async () => {
  const ctx = await setupTest({ index: { topicPage: 1 } });

  await ctx.memory.store.remember({
    text: 'Keeps bees',
    labels: { gist: 'keeps bees', topic: 'garden', triggers: [] },
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.remember({
    text: 'Grows beans',
    labels: { gist: 'grows beans', topic: 'garden', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const outcome = await ctx.recallOutcome({ topic: 'garden' });

  invariant(outcome.status === 'ok');

  const itemSchema = z.object({ itemID: z.string() });
  const page = z.object({ lines: z.array(itemSchema) }).parse(outcome.result);
  const [line] = page.lines;

  invariant(line);

  const uuids = await ctx.readUUIDs([line.itemID]);

  expect(outcome.record).toStrictEqual({
    lines: [{ itemID: line.itemID }],
    next: '1',
    leftOut: { count: 1, itemIDs: [], versions: 0 },
  });

  expect(outcome.hidden).toStrictEqual({ uuids: Object.fromEntries(uuids) });
  expect(JSON.stringify(outcome.record)).not.toInclude('grows beans');
  expect(JSON.stringify(outcome.record)).not.toInclude('garden');
});

test('it lists each topic with its subject and item count in the order of the memory index', async () => {
  const ctx = await setupTest();

  const items = [
    ['owner', 'people/friends', 'a friend'],
    ['owner', 'People/Friends', 'another friend'],
    ['owner', 'home', 'a pump'],
    ['shared', 'home', 'a joke'],
    ['self', 'habits', 'short replies'],
  ] as const;

  for (const [subject, topic, gist] of items) {
    await ctx.memory.store.remember({
      text: `Fact: ${gist}`,
      subject,
      labels: { gist, topic, triggers: [] },
      provenance: buildMockProvenance(),
    });
  }

  const outcome = await ctx.recallOutcome({ topics: true });
  const records = await ctx.readRecallRecords();

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      topics: [
        { topic: 'home', subject: 'owner', items: 1 },
        { topic: 'People/Friends', subject: 'owner', items: 2 },
        { topic: 'home', subject: 'shared', items: 1 },
        { topic: 'habits', subject: 'self', items: 1 },
      ],
      next: null,
      searched: { topics: true },
    },
    record: { next: null },
  });

  expect(records).toStrictEqual([]);
});

test('it narrows the topic list to the subjects the call names', async () => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'Fact: a pump',
    labels: { gist: 'a pump', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  await ctx.memory.store.remember({
    text: 'Fact: short replies',
    subject: 'self',
    labels: { gist: 'short replies', topic: 'habits', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const outcome = await ctx.recallOutcome({ topics: true, subjects: ['self'] });

  invariant(outcome.status === 'ok');

  expect(outcome.result).toStrictEqual({
    topics: [{ topic: 'habits', subject: 'self', items: 1 }],
    next: null,
    searched: { topics: true, subjects: ['self'] },
  });
});

test.each([
  ['a topic with a query', { topic: 'home', query: 'pump' }],
  ['a topic with itemIDs', { topic: 'home', itemIDs: ['b7kq2m9xza'] }],
  ['a topic with topics', { topic: 'home', topics: true }],
  ['topics with a query', { topics: true, query: 'pump' }],
  ['a topic with includeRetired', { topic: 'home', includeRetired: true }],
  ['a topic with includeHistory', { topic: 'home', includeHistory: true }],
  ['a topic with a limit', { topic: 'home', limit: 5 }],
  ['topics with a limit', { topics: true, limit: 5 }],
  ['a query with after', { query: 'pump', after: '3' }],
  ['itemIDs with after', { itemIDs: ['b7kq2m9xza'], after: '3' }],
])('it refuses %s and writes no recall record', async (_title, input) => {
  const ctx = await setupTest();

  await ctx.memory.store.remember({
    text: 'A spare pump',
    labels: { gist: 'a pump', topic: 'home', triggers: [] },
    provenance: buildMockProvenance(),
  });

  const outcome = await ctx.recallOutcome(input);
  const records = await ctx.readRecallRecords();

  expect(outcome).toStrictEqual({ status: 'error', message: expect.stringMatching(/^refused: /u) });
  expect(records).toStrictEqual([]);
});

test.each([
  ['an empty topic', { topic: '' }],
  ['a topic of 41 characters', { topic: 'x'.repeat(41) }],
  ['topics set to false', { topics: false }],
])('it rejects %s in its input schema', async (_title, input) => {
  const ctx = await setupTest();

  expect(ctx.tool.parseInput(input)).toMatchObject({ isValid: false });
});
