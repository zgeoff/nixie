import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import { buildAllowingDecisionPoint } from '@heynixie/policy/test-utils';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { createFakeClock } from '@zgeoff/testing/clock';
import { z } from 'zod';
import { buildMemoryTools } from '../memory/build-memory-tools';
import { buildMockProvenance } from '../test-utils/build-mock-provenance';
import { startTestMemory } from '../test-utils/start-test-memory';

async function setupTest() {
  const dayMs = 24 * 60 * 60 * 1000;
  const clock = createFakeClock({ startMs: Date.parse('2026-09-01T09:00:00Z') });
  const hold = { isArmed: false, queryIDs: new Set<string>() };
  const reached = Promise.withResolvers<void>();
  const released = Promise.withResolvers<void>();

  const memory = await startTestMemory({
    dbPlugin: {
      transformQuery: (args) => {
        if (hold.isArmed && JSON.stringify(args.node).includes('memory.recalled')) {
          hold.isArmed = false;

          hold.queryIDs.add(args.queryId.queryId);
        }

        return args.node;
      },
      transformResult: async (args) => {
        if (hold.queryIDs.has(args.queryId.queryId)) {
          reached.resolve();

          await released.promise;
        }

        return args.result;
      },
    },
    logClock: clock,
    gate: { clock },
    turn: { trigger: { items: 3, minScore: 0, minSimilarity: 1 } },
  });

  const registry = buildToolRegistry(
    buildMemoryTools(memory.store, { clock, ownerName: null, defaultZone: 'UTC' }),
  );

  const toolCallOptions = {
    registry,
    decide: buildAllowingDecisionPoint(),
    log: memory.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    queue: {
      enqueue: () => Promise.reject(new Error('no memory tool runs queued')),
      readOpenRepeat: () => Promise.resolve(null),
      readOpenAsk: () => Promise.resolve(null),
      waitForOutcome: () => Promise.resolve(null),
    },
    queuedWaitMs: 1000,
  };

  const callToolWith = (calls: typeof toolCallOptions, tool: string, input: JSONObject) =>
    runToolCall(
      { tool, input: structuredClone(input), toolUseID: null },
      {
        runID: 'run-1',
        thread: 'conversation',
        logThread: 'conversation',
        tools: [tool],
        model: { model: 'test-model', profile: 'standard' },
      },
      calls,
    );

  const callTool = (tool: string, input: JSONObject) => callToolWith(toolCallOptions, tool, input);

  // A recall by ID that returns its items and then never finishes, as a call cut off before its
  // result is written.
  const interruptRecall = async (input: JSONObject) => {
    const recalledOnce = Promise.withResolvers<void>();

    const interruptedRegistry = buildToolRegistry(
      buildMemoryTools(
        {
          ...memory.store,
          recall: async (request) => {
            const recalled = await memory.store.recall(request);

            recalledOnce.resolve();

            return await new Promise<typeof recalled>(() => {});
          },
        },
        { clock, ownerName: null, defaultZone: 'UTC' },
      ),
    );

    void callToolWith(
      { ...toolCallOptions, registry: interruptedRegistry },
      'memory.recall',
      input,
    );

    await recalledOnce.promise;
  };

  const usageItemSchema = z.object({
    itemID: z.string(),
    topic: z.string(),
    gist: z.string(),
    usage: z.string(),
    neverFiredTriggers: z.array(z.string()),
  });

  const usageSchema = z.object({ items: z.array(usageItemSchema), next: z.string().nullable() });
  const recallItemSchema = z.object({ itemID: z.string(), usage: z.string() });
  const recallSchema = z.object({ items: z.array(recallItemSchema) });

  return {
    memory,
    clock,
    dayMs,
    remember: async (gist: string, triggers: readonly string[] = []) => {
      const item = await memory.store.remember({
        text: `Text of ${gist}`,
        provenance: buildMockProvenance(),
        labels: { gist, topic: 'home', triggers },
      });

      const shortIDs = await memory.store.readShortIDs([item.itemID]);

      return { ...item, shortID: z.string().parse(shortIDs.get(item.itemID)) };
    },
    push: (text: string) =>
      memory.store.readTurnMemory({
        text,
        thread: 'conversation',
        excludedWords: [],
        held: {
          readVersions: () => Promise.resolve([]),
          readWriteStart: () => Promise.resolve(null),
        },
      }),
    callTool,
    interruptRecall,

    // holds the next read of the usage history after it reads, until the release runs
    holdUsageRead: () => {
      hold.isArmed = true;

      return { isReached: reached.promise, release: released.resolve };
    },
    buildLongPhrases: (gist: string) =>
      Array.from({ length: 5 }, (_, index) => `${gist} phrase ${String(index)} ${'w'.repeat(40)}`),
    readUsage: async (input: JSONObject) => {
      const result = await callTool('memory.usage', input);

      return usageSchema.parse(result.structuredContent);
    },
    readRecall: async (input: JSONObject) => {
      const result = await callTool('memory.recall', input);

      return recallSchema.parse(result.structuredContent);
    },
  };
}

test('it shows a never-surfaced item as never surfaced on its first recall by ID', async () => {
  const ctx = await setupTest();
  const piano = await ctx.remember('piano tuning', ['piano tuning']);
  const recalled = await ctx.readRecall({ itemIDs: [piano.shortID] });

  expect(recalled.items).toStrictEqual([{ itemID: piano.shortID, usage: 'never surfaced' }]);
});

test('it counts pushes and searches, and shows a recall by ID, on the next recall', async () => {
  const ctx = await setupTest();
  const piano = await ctx.remember('piano tuning', ['piano tuning']);

  await ctx.push('piano tuning');

  ctx.clock.advance(ctx.dayMs);

  await ctx.push('piano tuning');

  ctx.clock.advance(ctx.dayMs);

  await ctx.readRecall({ query: 'piano' });

  ctx.clock.advance(ctx.dayMs);

  await ctx.readRecall({ itemIDs: [piano.shortID] });

  ctx.clock.advance(2 * ctx.dayMs);

  const recalled = await ctx.readRecall({ itemIDs: [piano.shortID] });

  expect(recalled.items[0]?.usage).toBe(
    'surfaced 3 times (1 by search, 2 by push), last 3 days ago · recalled by ID 2 days ago',
  );
});

test('it counts a push after a recall by ID that never finished as a push, and gives the unfinished recall no ID credit', async () => {
  const ctx = await setupTest();
  const piano = await ctx.remember('piano tuning', ['piano tuning']);

  await ctx.interruptRecall({ itemIDs: [piano.shortID] });
  await ctx.readRecall({});
  await ctx.push('piano tuning');

  ctx.clock.advance(ctx.dayMs);

  const recalled = await ctx.readRecall({ itemIDs: [piano.shortID] });

  expect(recalled.items[0]?.usage).toBe('surfaced 1 time (1 by push), last 1 day ago');
});

test('it counts a list recall and a turn note for nothing', async () => {
  const ctx = await setupTest();
  const piano = await ctx.remember('piano tuning', []);

  await ctx.readRecall({});

  await ctx.memory.store.recall({
    itemIDs: [piano.itemID],
    isTurnNote: true,
    thread: 'conversation',
  });

  const recalled = await ctx.readRecall({ itemIDs: [piano.shortID] });

  expect(recalled.items[0]?.usage).toBe('never surfaced');
});

test('it dates the counts from the earliest record when the item was saved before it', async () => {
  const ctx = await setupTest();
  const first = await ctx.remember('boiler service', ['boiler service']);

  ctx.clock.advance(10 * ctx.dayMs);

  await ctx.push('boiler service');

  ctx.clock.advance(ctx.dayMs);

  const piano = await ctx.remember('piano tuning', []);

  ctx.clock.advance(ctx.dayMs);

  const recalled = await ctx.readRecall({ itemIDs: [first.shortID, piano.shortID] });

  expect(recalled.items.map((item) => item.usage)).toStrictEqual([
    'surfaced 1 time (1 by push) since 11 Sep, last 2 days ago',
    'never surfaced',
  ]);
});

test('it lists the items that have not surfaced, never-surfaced first, with the oldest surfaced next', async () => {
  const ctx = await setupTest();

  await ctx.remember('boiler service', ['boiler service']);
  await ctx.remember('piano tuning', ['piano tuning']);
  await ctx.remember('bin day', ['bin day']);
  await ctx.push('boiler service');

  ctx.clock.advance(10 * ctx.dayMs);

  await ctx.push('piano tuning');

  ctx.clock.advance(20 * ctx.dayMs);

  const listed = await ctx.readUsage({ days: 5 });

  expect(listed.items.map((item) => [item.gist, item.usage])).toStrictEqual([
    ['bin day', 'never surfaced'],
    ['boiler service', 'surfaced 1 time (1 by push), last 1 month ago'],
    ['piano tuning', 'surfaced 1 time (1 by push), last 2 weeks ago'],
  ]);
});

test('it leaves out an item that surfaced inside the period', async () => {
  const ctx = await setupTest();

  await ctx.remember('boiler service', ['boiler service']);
  await ctx.push('boiler service');

  ctx.clock.advance(3 * ctx.dayMs);

  const listed = await ctx.readUsage({ days: 7 });

  expect(listed.items).toStrictEqual([]);
});

test('it lists the trigger phrases of an item no push placed, and none for one a push placed', async () => {
  const ctx = await setupTest();

  await ctx.remember('boiler service', ['boiler service', 'boiler check']);
  await ctx.remember('piano tuning', ['piano tuning']);
  await ctx.push('piano tuning');

  ctx.clock.advance(10 * ctx.dayMs);

  const listed = await ctx.readUsage({ days: 1 });

  expect(listed.items.map((item) => [item.gist, item.neverFiredTriggers])).toStrictEqual([
    ['boiler service', ['boiler service', 'boiler check']],
    ['piano tuning', []],
  ]);
});

test('it counts a search as a surface, and its trigger phrases as unfired', async () => {
  const ctx = await setupTest();

  await ctx.remember('piano tuning', ['piano tuning']);
  await ctx.readRecall({ query: 'piano' });

  ctx.clock.advance(10 * ctx.dayMs);

  const listed = await ctx.readUsage({ days: 5 });

  expect(listed.items).toMatchObject([
    {
      usage: 'surfaced 1 time (1 by search), last 1 week ago',
      neverFiredTriggers: ['piano tuning'],
    },
  ]);
});

test('it lists a pinned item with the rest', async () => {
  const ctx = await setupTest();
  const piano = await ctx.remember('piano tuning', []);

  await ctx.memory.store.pin({
    itemID: piano.itemID,
    isPinned: true,
    provenance: buildMockProvenance(),
  });

  const listed = await ctx.readUsage({ days: 1 });

  expect(listed.items.map((item) => item.gist)).toStrictEqual(['piano tuning']);
});

test('it lists a trigger phrase that no push named when another phrase of the item fired', async () => {
  const ctx = await setupTest();

  await ctx.remember('boiler service', ['boiler service', 'radiator bleed']);
  await ctx.push('boiler service');

  ctx.clock.advance(10 * ctx.dayMs);

  const listed = await ctx.readUsage({ days: 1 });

  expect(listed.items.map((item) => item.neverFiredTriggers)).toStrictEqual([['radiator bleed']]);
});

test('it pages the list with a cursor, and writes no recalled record', async () => {
  const ctx = await setupTest();

  for (let count = 0; count < 101; count += 1) {
    await ctx.remember(`item ${String(count).padStart(3, '0')}`);
  }

  const first = await ctx.readUsage({ days: 1 });
  const second = await ctx.readUsage({ days: 1, cursor: first.next });
  const recalled = await ctx.readRecall({ itemIDs: [first.items[0]?.itemID ?? ''] });

  expect({
    first: first.items.length,
    next: first.next,
    second: second.items.map((item) => item.gist),
    secondNext: second.next,
    surfaced: recalled.items[0]?.usage,
  }).toStrictEqual({
    first: 100,
    next: expect.stringMatching(/^never\.\d+$/u),
    second: ['item 100'],
    secondNext: null,
    surfaced: 'never surfaced',
  });
});

test('it cuts a page at the size limit and continues after its last entry', async () => {
  const ctx = await setupTest();

  const gists = Array.from({ length: 60 }, (_, count) => `item ${String(count).padStart(2, '0')}`);

  for (const gist of gists) {
    await ctx.remember(gist, ctx.buildLongPhrases(gist));
  }

  const first = await ctx.readUsage({ days: 1 });
  const second = await ctx.readUsage({ days: 1, cursor: first.next });

  expect([...first.items, ...second.items].map((item) => item.gist)).toStrictEqual(gists);
  expect([first.items.length < 60, second.next]).toStrictEqual([true, null]);
});

test('it skips no item on the next page when an item of the first page surfaces between the pages', async () => {
  const ctx = await setupTest();

  const gists = Array.from({ length: 60 }, (_, count) => `item ${String(count).padStart(2, '0')}`);

  await ctx.remember('item 00', ['boiler service']);

  for (const gist of gists.slice(1)) {
    await ctx.remember(gist, ctx.buildLongPhrases(gist));
  }

  ctx.clock.advance(10 * ctx.dayMs);

  const first = await ctx.readUsage({ days: 1 });

  await ctx.push('boiler service');

  const second = await ctx.readUsage({ days: 1, cursor: first.next });

  expect([...first.items.slice(1), ...second.items].map((item) => item.gist)).toStrictEqual(
    gists.slice(1),
  );
});

test('it leaves out an item that a forget removes while the usage history is being read', async () => {
  const ctx = await setupTest();
  const piano = await ctx.remember('piano tuning', []);

  await ctx.remember('bin day', []);

  const held = ctx.holdUsageRead();
  const listing = ctx.readUsage({ days: 1 });

  await held.isReached;

  await ctx.memory.store.forget({ target: piano, provenance: buildMockProvenance() });

  held.release();

  const listed = await listing;

  expect(listed.items.map((item) => item.gist)).toStrictEqual(['bin day']);
});

test.each([
  ['a days of 0', { days: 0 }],
  ['a days of 3651', { days: 3651 }],
  ['a days that is not a whole number', { days: 1.5 }],
  ['no days', {}],
])('it refuses %s', async (_name, input) => {
  const ctx = await setupTest();
  const result = await ctx.callTool('memory.usage', input);

  expect(result.isError).toBe(true);
});

test.each([[1], [3650]])('it accepts a days of %d', async (days) => {
  const ctx = await setupTest();
  const result = await ctx.callTool('memory.usage', { days });

  expect(result.isError).not.toBe(true);
});
