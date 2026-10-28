import { expect, test } from 'bun:test';
import { readRecords, writeRecords } from '@heynixie/log';
import { buildTestClock } from '@heynixie/testing';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildMemoryTools } from './build-memory-tools';
import type { MomentTables } from './moment-types';
import { startTestMemory } from './test-utils/start-test-memory';
import { writeOwnerMessageRecord } from './test-utils/write-owner-message-record';

async function setupTest() {
  const clock = buildTestClock(Date.parse('2026-10-14T11:10:00Z'));

  const memory = await startTestMemory({ logClock: clock });

  const registry = buildToolRegistry(
    buildMemoryTools(memory.store, { clock, ownerName: null, agentName: null, defaultZone: 'UTC' }),
  );

  return {
    memory,
    clock,
    db: memory.writer.db.$extendTables<MomentTables>(),
    run: {
      runID: 'run-1',
      thread: 'conversation',
      tools: [
        'memory.recall',
        'moment.keep',
        'moment.edit',
        'moment.link',
        'moment.retire',
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

test('#moment.keep refuses a reflection argument and keeps nothing', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'we settle the kettle question today',
    spans: [],
  });

  const result = await runToolCall(
    {
      tool: 'moment.keep',
      input: {
        firstEventID: String(message),
        lastEventID: String(message),
        title: 'The kettle argument',
        reflection: 'The noise mattered more than the price.',
      },
      toolUseID: 'toolu_1',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  const moments = await ctx.db.selectFrom('moments').select('moment_id').execute();

  expect(result.isError).toBe(true);
  expect(moments).toStrictEqual([]);
});

test('#moment.keep returns the moment ID, the week count and a pending reflection, and records no title', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'we settle the kettle question today',
    spans: [],
  });

  const result = await runToolCall(
    {
      tool: 'moment.keep',
      input: {
        firstEventID: String(message),
        lastEventID: String(message),
        title: 'The kettle argument',
      },
      toolUseID: 'toolu_1',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  const row = await ctx.db
    .selectFrom('moments')
    .select(['moment_id', 'short_id'])
    .executeTakeFirstOrThrow();

  const records = await readRecords(ctx.memory.log, {
    afterSequence: message,
    kinds: ['tool_called', 'tool_result'],
  });

  expect(result.structuredContent).toStrictEqual({
    momentID: row.short_id,
    keptThisWeek: 1,
    reflection: 'pending',
  });

  expect(records.map((entry) => entry.record.erasable)).toStrictEqual([
    {
      status: 'readable',
      fields: { input: { firstEventID: String(message), lastEventID: String(message) } },
    },
    {
      status: 'readable',
      fields: { result: { momentID: row.moment_id, version: 1, keptThisWeek: 1 } },
    },
  ]);
});

test('#moment.keep counts the moments of the last 7 days across the conversation, every task and the owner', async () => {
  const ctx = await setupTest();

  const [old, ownMessage, taskWake, ownerWake] = await writeRecords(ctx.memory.log, [
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'morning-reading',
      payload: {},
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the kettle rule stands' },
    },
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'evening-digest',
      payload: {},
    },
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'garden-plan',
      payload: {},
    },
  ]);

  invariant(old && ownMessage && taskWake && ownerWake);

  await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'morning-reading', model: 'claude-test-4' },
    thread: 'morning-reading',
    firstSequence: old.sequence,
    lastSequence: old.sequence,
    title: 'The first reading',
  });

  ctx.clock.advance(8 * 24 * 60 * 60 * 1000);

  await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'evening-digest', model: 'claude-test-4' },
    thread: 'evening-digest',
    firstSequence: taskWake.sequence,
    lastSequence: taskWake.sequence,
    title: 'The digest that ran late',
  });

  await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'garden-plan',
    firstSequence: ownerWake.sequence,
    lastSequence: ownerWake.sequence,
    title: 'The garden plan',
  });

  const result = await runToolCall(
    {
      tool: 'moment.keep',
      input: {
        firstEventID: String(ownMessage.sequence),
        lastEventID: String(ownMessage.sequence),
        title: 'The kettle argument',
      },
      toolUseID: 'toolu_1',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toMatchObject({ keptThisWeek: 3 });
});

test('#moment.read returns every record of a span when asked for all, tool calls and results included, each with its source', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'which kettle did we agree on',
    spans: [],
  });

  await runToolCall(
    { tool: 'moment.find', input: { query: 'kettle' }, toolUseID: 'toolu_1' },
    ctx.run,
    ctx.toolCallOptions,
  );

  const [reply] = await writeRecords(ctx.memory.log, [
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the quiet one, for the noise' },
    },
  ]);

  invariant(reply);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message,
    lastSequence: reply.sequence,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const result = await runToolCall(
    {
      tool: 'moment.read',
      input: { momentID: kept.shortID, records: 'all' },
      toolUseID: 'toolu_2',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toMatchObject({
    momentID: kept.shortID,
    version: 1,
    title: 'The kettle argument',
    note: null,
    reflections: [],
    next: null,
    records: [
      {
        eventID: String(message),
        kind: 'owner_message',
        source: 'owner',
        text: 'which kettle did we agree on',
      },
      {
        eventID: String(message + 1),
        kind: 'tool_called',
        source: 'nixie',
        payload: { tool: 'moment.find' },
        decision: 'allow',
        text: JSON.stringify({ input: {} }),
      },
      {
        eventID: String(message + 2),
        kind: 'tool_result',
        source: 'untrusted',
        payload: { outcome: 'result' },
        text: JSON.stringify({ result: { moments: [], next: null } }),
      },
      {
        eventID: String(reply.sequence),
        kind: 'model.reply',
        source: 'nixie',
        text: 'the quiet one, for the noise',
      },
    ],
  });
});

test("#moment.read returns only the owner's messages and the replies of a span by default, in order, each with its eventID, time and source", async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'should the shed door face the hedge',
    spans: [],
  });

  await runToolCall(
    { tool: 'moment.find', input: { query: 'shed' }, toolUseID: 'toolu_1' },
    ctx.run,
    ctx.toolCallOptions,
  );

  const [step, reply] = await writeRecords(ctx.memory.log, [
    {
      kind: 'task.wake',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      payload: {},
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'face it away from the hedge, so the rain runs off' },
    },
  ]);

  invariant(step && reply);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message,
    lastSequence: reply.sequence,
    title: 'The shed door',
  });

  invariant(kept.status === 'written');

  const result = await runToolCall(
    { tool: 'moment.read', input: { momentID: kept.shortID }, toolUseID: 'toolu_2' },
    ctx.run,
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toMatchObject({
    next: null,
    records: [
      {
        eventID: String(message),
        kind: 'owner_message',
        recordedAt: '2026-10-14T11:10:00.000Z',
        source: 'owner',
        text: 'should the shed door face the hedge',
      },
      {
        eventID: String(reply.sequence),
        kind: 'model.reply',
        recordedAt: '2026-10-14T11:10:00.000Z',
        source: 'nixie',
        text: 'face it away from the hedge, so the rain runs off',
      },
    ],
  });
});

test("#moment.read reads a span longer than a page through the cursor by default, each of the owner's messages and the replies once and in order", async () => {
  const ctx = await setupTest();

  const sequences = await writeRecords(
    ctx.memory.log,
    Array.from({ length: 40 }, (_, index) =>
      index % 2 === 0
        ? {
            kind: 'model.reply' as const,
            definitions: { snapshotHash: 'sha256:test' },
            thread: 'conversation',
            erasable: { text: `${String(index)} ${'the bees swarm again '.repeat(60)}` },
          }
        : {
            kind: 'task.wake' as const,
            definitions: { snapshotHash: 'sha256:test' },
            thread: 'conversation',
            payload: {},
          },
    ),
  );

  const first = sequences.at(0);
  const last = sequences.at(-1);

  invariant(first && last);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: first.sequence,
    lastSequence: last.sequence,
    title: 'The swarm week',
  });

  invariant(kept.status === 'written');

  const entrySchema = z.object({ eventID: z.string() });
  const pageSchema = z.object({ records: z.array(entrySchema), next: z.string().nullable() });

  const firstCall = await runToolCall(
    { tool: 'moment.read', input: { momentID: kept.shortID }, toolUseID: 'toolu_1' },
    ctx.run,
    ctx.toolCallOptions,
  );

  const firstPage = pageSchema.parse(firstCall.structuredContent);

  invariant(firstPage.next !== null);

  const secondCall = await runToolCall(
    {
      tool: 'moment.read',
      input: { momentID: kept.shortID, after: firstPage.next },
      toolUseID: 'toolu_2',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  const secondPage = pageSchema.parse(secondCall.structuredContent);
  const read = [...firstPage.records, ...secondPage.records];

  expect(firstPage.records.length).toBeLessThan(20);
  expect(secondPage.next).toBeNull();

  expect(read.map((entry) => Number(entry.eventID))).toStrictEqual(
    sequences.filter((_, index) => index % 2 === 0).map((record) => record.sequence),
  );
});

test('#moment.read keeps a span that holds outside content untrusted when it returns only the conversation', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'what does the seed catalogue say about frost',
    spans: [],
  });

  const [fetched, reply] = await writeRecords(ctx.memory.log, [
    {
      kind: 'tool_result',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      contentSource: 'untrusted',
      payload: { outcome: 'result', sources: { text: 'untrusted' } },
      erasable: { result: { text: 'sow after the last frost in May' } },
    },
    {
      kind: 'model.reply',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the catalogue says to sow after the last frost in May' },
    },
  ]);

  invariant(fetched && reply);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message,
    lastSequence: reply.sequence,
    title: 'Sowing after the frost',
  });

  invariant(kept.status === 'written');

  const result = await runToolCall(
    { tool: 'moment.read', input: { momentID: kept.shortID }, toolUseID: 'toolu_1' },
    ctx.run,
    ctx.toolCallOptions,
  );

  const [readResult] = await readRecords(ctx.memory.log, {
    afterSequence: reply.sequence,
    kinds: ['tool_result'],
  });

  expect(result.structuredContent).toMatchObject({
    records: [{ eventID: String(message) }, { eventID: String(reply.sequence) }],
  });

  expect(readResult?.record.contentSource).toBe('untrusted');
});

test('#moment.read keeps a full page of short records within its cap as the model receives it', async () => {
  const ctx = await setupTest();

  const sequences = await writeRecords(
    ctx.memory.log,
    Array.from({ length: 600 }, (_, index) => ({
      kind: 'model.reply' as const,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: `Stir ${String(index)}.` },
    })),
  );

  const first = sequences.at(0);
  const last = sequences.at(-1);

  invariant(first && last);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: first.sequence,
    lastSequence: last.sequence,
    title: 'Making the jam',
  });

  invariant(kept.status === 'written');

  const result = await runToolCall(
    { tool: 'moment.read', input: { momentID: kept.shortID }, toolUseID: 'toolu_1' },
    ctx.run,
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toMatchObject({ next: expect.toBeString() });
  expect(Math.ceil(JSON.stringify(result.structuredContent).length / 4)).toBeLessThanOrEqual(6000);
});

test('#moment.read reads a span longer than a page through the cursor when asked for all, every record once and in order', async () => {
  const ctx = await setupTest();

  const sequences = await writeRecords(
    ctx.memory.log,
    Array.from({ length: 40 }, (_, index) => ({
      kind: 'model.reply' as const,
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: `${String(index)} ${'the kettle hums '.repeat(60)}` },
    })),
  );

  const first = sequences.at(0);
  const last = sequences.at(-1);

  invariant(first && last);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: first.sequence,
    lastSequence: last.sequence,
    title: 'An hour of kettle noise',
  });

  invariant(kept.status === 'written');

  const entrySchema = z.object({ eventID: z.string() });
  const pageSchema = z.object({ records: z.array(entrySchema), next: z.string().nullable() });

  const firstCall = await runToolCall(
    {
      tool: 'moment.read',
      input: { momentID: kept.shortID, records: 'all' },
      toolUseID: 'toolu_1',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  const firstPage = pageSchema.parse(firstCall.structuredContent);

  invariant(firstPage.next !== null);

  const secondCall = await runToolCall(
    {
      tool: 'moment.read',
      input: { momentID: kept.shortID, after: firstPage.next, records: 'all' },
      toolUseID: 'toolu_2',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  const secondPage = pageSchema.parse(secondCall.structuredContent);
  const read = [...firstPage.records, ...secondPage.records].map((entry) => Number(entry.eventID));

  expect(firstPage.records.length).toBeLessThan(40);
  expect(secondPage.next).toBeNull();
  expect(read).toStrictEqual(sequences.map((record) => record.sequence));
});

test('#moment.read reads reflections longer than a page through the cursor, each once and in order, then the records', async () => {
  const ctx = await setupTest();

  const [message] = await writeRecords(ctx.memory.log, [
    {
      kind: 'owner_message',
      definitions: { snapshotHash: 'sha256:test' },
      thread: 'conversation',
      erasable: { text: 'the tomatoes split after the storm' },
    },
  ]);

  invariant(message);

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message.sequence,
    lastSequence: message.sequence,
    title: 'The split tomatoes',
  });

  invariant(kept.status === 'written');

  for (const version of [1, 2, 3, 4, 5, 6, 7, 8]) {
    ctx.clock.advance(60_000);

    await ctx.memory.store.moments.edit({
      caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
      target: { momentID: kept.momentID, version },
      change: {
        kind: 'reflection',
        text: `${String(version)} ${'rain after drought '.repeat(200)}`,
      },
    });
  }

  const reflectionSchema = z.object({ text: z.string() });
  const entrySchema = z.object({ eventID: z.string() });

  const pageSchema = z.object({
    reflections: z.array(reflectionSchema),
    records: z.array(entrySchema),
    next: z.string().nullable(),
  });

  const firstCall = await runToolCall(
    { tool: 'moment.read', input: { momentID: kept.shortID }, toolUseID: 'toolu_1' },
    ctx.run,
    ctx.toolCallOptions,
  );

  const firstPage = pageSchema.parse(firstCall.structuredContent);

  invariant(firstPage.next !== null);

  const secondCall = await runToolCall(
    {
      tool: 'moment.read',
      input: { momentID: kept.shortID, after: firstPage.next },
      toolUseID: 'toolu_2',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  const secondPage = pageSchema.parse(secondCall.structuredContent);

  const reflections = [...firstPage.reflections, ...secondPage.reflections].map(
    (reflection) => reflection.text.split(' ')[0],
  );

  expect(firstPage.next).toStartWith('r');
  expect(firstPage.records).toStrictEqual([]);
  expect(reflections).toStrictEqual(['1', '2', '3', '4', '5', '6', '7', '8']);

  expect(secondPage.records.map((entry) => entry.eventID)).toStrictEqual([
    String(message.sequence),
  ]);

  expect(secondPage.next).toBeNull();
});

test('#moment.edit refuses an edit of a reflection that another model wrote', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'we settle the kettle question today',
    spans: [],
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-3' },
    thread: 'conversation',
    firstSequence: message,
    lastSequence: message,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const reflected = await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-3' },
    target: { momentID: kept.shortID, version: 1 },
    change: { kind: 'reflection', text: 'The noise mattered more than the price.' },
  });

  invariant(reflected.status === 'written' && reflected.reflectionID !== undefined);

  const result = await runToolCall(
    {
      tool: 'moment.edit',
      input: {
        momentID: kept.shortID,
        version: 2,
        reflectionID: reflected.reflectionID,
        reflection: 'The price mattered most.',
      },
      toolUseID: 'toolu_1',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  expect(result).toStrictEqual({
    content: [
      {
        type: 'text',
        text: 'refused: that reflection is labelled with another model, so you cannot edit it; add a reflection of your own instead',
      },
    ],
    isError: true,
  });
});

test('#moment.edit adds a reflection under the model of the run', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'we settle the kettle question today',
    spans: [],
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message,
    lastSequence: message,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  await runToolCall(
    {
      tool: 'moment.edit',
      input: {
        momentID: kept.shortID,
        version: 1,
        reflection: 'The noise mattered more than the price.',
      },
      toolUseID: 'toolu_1',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  const reflection = await ctx.db
    .selectFrom('moment_reflections')
    .select('model')
    .executeTakeFirstOrThrow();

  expect(reflection.model).toBe('claude-test-4');
});

test('#moment.edit refuses two changes in one call', async () => {
  const ctx = await setupTest();

  const result = await runToolCall(
    {
      tool: 'moment.edit',
      input: {
        momentID: 'q4n8v2hw6t',
        version: 1,
        title: 'The kettle rule',
        reflection: 'The noise mattered more than the price.',
      },
      toolUseID: 'toolu_1',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  expect(result.content).toStrictEqual([
    {
      type: 'text',
      text: 'pass exactly one change: title, both firstEventID and lastEventID, or reflection',
    },
  ]);
});

test('#moment.edit changes only the title, and returns the next version', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'we settle the kettle question today',
    spans: [],
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message,
    lastSequence: message,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const result = await runToolCall(
    {
      tool: 'moment.edit',
      input: { momentID: kept.shortID, version: 1, title: 'The kettle rule' },
      toolUseID: 'toolu_1',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  const row = await ctx.db
    .selectFrom('moments')
    .select(['first_sequence', 'last_sequence', 'title_sequence', 'version'])
    .executeTakeFirstOrThrow();

  const read = await ctx.memory.store.moments.read({
    momentID: kept.shortID,
    after: null,
    tokenCap: 2000,
    records: 'all',
  });

  expect(result.structuredContent).toStrictEqual({ momentID: kept.shortID, version: 2 });

  expect(row).toStrictEqual({
    first_sequence: message,
    last_sequence: message,
    title_sequence: expect.toSatisfy((sequence: number) => sequence > kept.sequence),
    version: 2,
  });

  expect(read?.title).toBe('The kettle rule');
});

test('#moment.edit moves both edges of the span to the event IDs it was given', async () => {
  const ctx = await setupTest();

  const first = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'we settle the kettle question today',
    spans: [],
  });

  const second = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'the quiet one costs twice as much',
    spans: [],
  });

  const third = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'fine, the quiet one',
    spans: [],
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: first,
    lastSequence: first,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const result = await runToolCall(
    {
      tool: 'moment.edit',
      input: {
        momentID: kept.shortID,
        version: 1,
        firstEventID: String(second),
        lastEventID: String(third),
      },
      toolUseID: 'toolu_1',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  const row = await ctx.db
    .selectFrom('moments')
    .select(['first_sequence', 'last_sequence', 'version'])
    .executeTakeFirstOrThrow();

  expect(result.structuredContent).toStrictEqual({ momentID: kept.shortID, version: 2 });
  expect(row).toStrictEqual({ first_sequence: second, last_sequence: third, version: 2 });
});

test('#moment.retire retires an active moment when the call passes no restore', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'we settle the kettle question today',
    spans: [],
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message,
    lastSequence: message,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  const result = await runToolCall(
    { tool: 'moment.retire', input: { momentID: kept.shortID, version: 1 }, toolUseID: 'toolu_1' },
    ctx.run,
    ctx.toolCallOptions,
  );

  const row = await ctx.db.selectFrom('moments').select('state').executeTakeFirstOrThrow();

  expect(result.structuredContent).toStrictEqual({
    momentID: kept.shortID,
    version: 2,
    state: 'retired',
  });

  expect(row.state).toBe('retired');
});

test('#moment.retire restores a retired moment when the call passes restore: true', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'we settle the kettle question today',
    spans: [],
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message,
    lastSequence: message,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.retire({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 1 },
    isRetired: true,
  });

  const result = await runToolCall(
    {
      tool: 'moment.retire',
      input: { momentID: kept.shortID, version: 2, restore: true },
      toolUseID: 'toolu_1',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  const row = await ctx.db.selectFrom('moments').select('state').executeTakeFirstOrThrow();

  expect(result.structuredContent).toStrictEqual({
    momentID: kept.shortID,
    version: 3,
    state: 'active',
  });

  expect(row.state).toBe('active');
});

test('#moment.find finds a moment by a word of its reflection', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'we settle the kettle question today',
    spans: [],
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message,
    lastSequence: message,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message,
    lastSequence: message,
    title: 'The watering plan',
  });

  await ctx.memory.store.moments.edit({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    target: { momentID: kept.shortID, version: 1 },
    change: { kind: 'reflection', text: 'The noise mattered more than the price.' },
  });

  const result = await runToolCall(
    { tool: 'moment.find', input: { query: 'noise' }, toolUseID: 'toolu_1' },
    ctx.run,
    ctx.toolCallOptions,
  );

  expect(result.structuredContent).toStrictEqual({
    moments: [
      {
        momentID: kept.shortID,
        version: 2,
        title: 'The kettle argument',
        keptAt: '2026-10-14T11:10:00.000Z',
        state: 'active',
      },
    ],
    next: null,
  });
});

test('#moment.find lists moments newest first a page at a time, and leaves out a retired one', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'we settle the kettle question today',
    spans: [],
  });

  const titles = ['The kettle argument', 'The watering plan', 'The spare key', 'The old rota'];
  const kept = [];

  for (const title of titles) {
    const written = await ctx.memory.store.moments.keep({
      caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
      thread: 'conversation',
      firstSequence: message,
      lastSequence: message,
      title,
    });

    invariant(written.status === 'written');

    kept.push(written);
  }

  const rota = kept.at(-1);

  invariant(rota);

  await ctx.memory.store.moments.retire({
    caller: { kind: 'owner' },
    target: { momentID: rota.momentID, version: 1 },
    isRetired: true,
  });

  const firstPage = await runToolCall(
    { tool: 'moment.find', input: { limit: 2 }, toolUseID: 'toolu_1' },
    ctx.run,
    ctx.toolCallOptions,
  );

  expect(firstPage.structuredContent).toMatchObject({
    moments: [{ title: 'The spare key' }, { title: 'The watering plan' }],
    next: String(kept[1]?.sequence),
  });
});

test('#memory.recall returns the moments linked to an item by ID and title, and records only their IDs', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'only the quiet kettle from now on',
    spans: [],
  });

  const item = await ctx.memory.store.remember({
    text: 'Buys only quiet kettles',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'model', thread: 'conversation', model: 'claude-test-4' },
    thread: 'conversation',
    firstSequence: message,
    lastSequence: message,
    title: 'The kettle argument',
  });

  invariant(kept.status === 'written');

  await runToolCall(
    {
      tool: 'moment.link',
      input: { momentID: kept.shortID, version: 1, itemID: item.itemID },
      toolUseID: 'toolu_1',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  const result = await runToolCall(
    { tool: 'memory.recall', input: { itemIDs: [item.itemID] }, toolUseID: 'toolu_2' },
    ctx.run,
    ctx.toolCallOptions,
  );

  const [recalled] = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['tool_result'],
    order: 'newest',
    limit: 1,
  });

  expect(result.structuredContent).toMatchObject({
    items: [{ moments: [{ momentID: kept.shortID, title: 'The kettle argument' }] }],
  });

  expect(recalled?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: {
      result: {
        items: [{ itemID: item.itemID, version: 1, momentIDs: [kept.shortID] }],
        next: null,
      },
    },
  });
});

test('it leaves every title, reflection and query out of the records of moment tool calls', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'we settle the kettle question today',
    spans: [],
  });

  const keep = await runToolCall(
    {
      tool: 'moment.keep',
      input: {
        firstEventID: String(message),
        lastEventID: String(message),
        title: 'Marigold-title-7QX',
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
      input: { momentID, version: 1, reflection: 'Marigold-reflection-7QX' },
      toolUseID: 'toolu_2',
    },
    ctx.run,
    ctx.toolCallOptions,
  );

  await runToolCall(
    { tool: 'moment.find', input: { query: 'Marigold-title-7QX' }, toolUseID: 'toolu_3' },
    ctx.run,
    ctx.toolCallOptions,
  );

  await runToolCall(
    { tool: 'moment.read', input: { momentID }, toolUseID: 'toolu_4' },
    ctx.run,
    ctx.toolCallOptions,
  );

  const records = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['tool_called', 'tool_result'],
  });

  expect(records).toHaveLength(8);
  expect(JSON.stringify(records.map((entry) => entry.record.erasable))).not.toInclude('Marigold');
});
