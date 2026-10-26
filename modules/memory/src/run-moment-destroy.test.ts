import { expect, mock, test } from 'bun:test';
import {
  readRecords,
  runProjectionRebuild,
  writeRecords,
  writeRecordsInTransaction,
} from '@heynixie/log';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildMemoryTools } from './build-memory-tools';
import type { MomentTables } from './moment-types';
import { readMomentRows } from './test-utils/read-moment-rows';
import { startNextTestMemory } from './test-utils/start-next-test-memory';
import { startTestMemory } from './test-utils/start-test-memory';
import type { CleanupSessions } from './types';

async function setupTest() {
  const cleanupSessions = mock<CleanupSessions>(() => Promise.resolve());

  const memory = await startTestMemory({ cleanupSessions });

  const registry = buildToolRegistry(
    buildMemoryTools(memory.store, {
      clock: { now: () => Date.now() },
      ownerName: null,
      agentName: null,
      defaultZone: 'UTC',
    }),
  );

  return {
    memory,
    cleanupSessions,
    db: memory.writer.db.$extendTables<MomentTables>(),
    run: {
      runID: 'run-1',
      thread: 'conversation',
      tools: [
        'memory.recall',
        'moment.keep',
        'moment.edit',
        'moment.link',
        'moment.find',
        'moment.read',
      ],
      model: { model: 'claude-test-4', profile: 'standard' },
    },
    toolCallOptions: {
      registry,

      decide: () => ({
        decision: { outcome: 'allow' as const, stage: 3, rule: null },
        sentence: null,
      }),
      log: memory.log,
      definitions: () => ({ snapshotHash: 'sha256:test' }),

      queue: {
        enqueue: () => Promise.reject(new Error('no moment tool runs queued')),
        waitForOutcome: () => Promise.resolve(null),
      },
      queuedWaitMs: 1000,
    },
  };
}

test('it destroys a moment and leaves no readable copy of its title, note or reflections in any record', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'owner',
      erasable: { text: 'only the quiet kettle from now on' },
    },
  ]);

  invariant(message);

  const item = await ctx.memory.store.remember({
    text: 'Buys only quiet kettles',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const keep = await runToolCall(
    {
      tool: 'moment.keep',
      input: {
        firstEventID: String(message.sequence),
        lastEventID: String(message.sequence),
        title: 'Juniper-title-3VK',
      },
      toolUseID: 'toolu_1',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  const momentID = z.object({ momentID: z.string() }).parse(keep.structuredContent).momentID;

  await runToolCall(
    {
      tool: 'moment.edit',
      input: { momentID, version: 1, reflection: 'Juniper-reflection-3VK' },
      toolUseID: 'toolu_2',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID, version: 2 },
    change: { kind: 'note', note: 'Juniper-note-3VK' },
  });

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID, version: 3 },
    change: { kind: 'title', title: 'Juniper-retitle-3VK' },
  });

  await runToolCall(
    {
      tool: 'moment.link',
      input: { momentID, version: 4, itemID: item.itemID },
      toolUseID: 'toolu_3',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  for (const [tool, input] of [
    ['memory.recall', { itemIDs: [item.itemID] }],
    ['moment.find', { query: 'Juniper-title-3VK' }],
    ['moment.read', { momentID }],
  ] as const) {
    await runToolCall({ tool, input, toolUseID: `toolu_${tool}` }, ctx.run, ctx.toolCallOptions);
  }

  const destroyed = await ctx.memory.store.moments.destroy({ momentID, version: 5 });
  const records = await readRecords(ctx.memory.log, { afterSequence: 0, limit: 1000 });

  const readable = records.flatMap((entry) =>
    entry.record.erasable.status === 'readable' ? [entry.record.erasable.fields] : [],
  );

  const links = await ctx.memory.store.moments.readLinks([item.itemID]);

  const matches = await ctx.memory.store.moments.readMatches({
    words: ['Juniper-title-3VK'],
    from: null,
    to: null,
    includeRetired: true,
    before: null,
    limit: 10,
  });

  const row = await ctx.db.selectFrom('moments').select('state').executeTakeFirstOrThrow();

  expect(destroyed).toMatchObject({ status: 'destroyed' });
  expect(row.state).toBe('destroyed');
  expect(JSON.stringify(readable)).not.toInclude('Juniper');
  expect(readable).toContainEqual({ text: 'only the quiet kettle from now on' });
  expect(links.size).toBe(0);
  expect(matches.matches).toStrictEqual([]);
  expect(ctx.cleanupSessions).toHaveBeenCalledExactlyOnceWith({ momentID: expect.any(String) });
});

test('it refuses a destroy bound to a version the moment moved past', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'only the quiet kettle from now on' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: kept.momentID, version: 1 },
    change: { kind: 'title', title: 'The kettle rule' },
  });

  const destroyed = await ctx.memory.store.moments.destroy({
    momentID: kept.momentID,
    version: 1,
  });

  expect(destroyed).toStrictEqual({ status: 'refused', reason: 'stale' });
});

test("it leaves another moment's title, note and reflections readable after a destroy", async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'only the quiet kettle from now on' },
    },
  ]);

  invariant(message);

  const doomed = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  const spared = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The quiet kettle',
  });

  invariant(doomed.status === 'written' && spared.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: doomed.shortID, version: 1 },
    change: { kind: 'reflection', text: 'The argument was about the noise.' },
  });

  await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: spared.shortID, version: 1 },
    change: { kind: 'reflection', text: 'Quiet won over cheap.' },
  });

  await ctx.memory.store.moments.edit({
    caller: { kind: 'owner' },
    target: { momentID: spared.momentID, version: 2 },
    change: { kind: 'note', note: 'Bought the quiet one in the end.' },
  });

  const destroyed = await ctx.memory.store.moments.destroy({
    momentID: doomed.momentID,
    version: 2,
  });

  invariant(destroyed.status === 'destroyed');

  const read = await ctx.memory.store.moments.read({
    momentID: spared.momentID,
    after: null,
    tokenCap: 2000,
  });

  expect(read).toMatchObject({
    title: 'The quiet kettle',
    note: 'Bought the quiet one in the end.',
    reflections: [{ model: 'claude-test-4', text: 'Quiet won over cheap.' }],
  });
});

test("it rolls back the caller's write in the destroy's transaction when it refuses the destroy", async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'only the quiet kettle from now on' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.destroy({ momentID: kept.momentID, version: 2 }, async (tx) => {
    await writeRecordsInTransaction(tx, ctx.memory.log, [
      {
        kind: 'task.wake',
        definitions: { snapshotHash: 'sha256:test' },
        thread: 'client-action',
        payload: {},
      },
    ]);
  });

  const wakes = await readRecords(ctx.memory.log, { afterSequence: 0, kinds: ['task.wake'] });

  expect(wakes).toStrictEqual([]);
});

test('it finishes a destroy that a crash cut short when the store starts again', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'only the quiet kettle from now on' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'Juniper-title-3VK',
  });

  invariant(kept.status === 'written');

  await writeRecords(ctx.memory.log, [
    {
      kind: 'moment_destroyed',
      definitions: { snapshotHash: 'sha256:test' },
      payload: { momentID: kept.momentID, version: 1, stage: 'started' },
    },
  ]);

  const next = await startNextTestMemory(ctx.memory);

  const [record] = await readRecords(next.log, {
    afterSequence: kept.sequence - 1,
    limit: 1,
  });

  const row = await next.writer.db
    .$extendTables<MomentTables>()
    .selectFrom('moments')
    .select('state')
    .executeTakeFirstOrThrow();

  expect(record?.record.erasable).toStrictEqual({ status: 'shredded' });
  expect(row.state).toBe('destroyed');
});

test('it rebuilds the rows of a destroyed moment equal to the live rows', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'only the quiet kettle from now on' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 1 },
    change: { kind: 'reflection', text: 'The noise mattered more than the price.' },
  });

  await ctx.memory.store.moments.destroy({ momentID: kept.momentID, version: 2 });

  const live = await readMomentRows(ctx.db);

  await runProjectionRebuild(ctx.memory.log);

  const rebuilt = await readMomentRows(ctx.db);

  expect(rebuilt).toStrictEqual(live);
});
