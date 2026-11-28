import { expect, onTestFinished, setSystemTime, test } from 'bun:test';
import {
  readExpiredSequences,
  readOpenErasures,
  readRecords,
  runProjectionRebuild,
  writeRecords,
} from '@heynixie/log';
import { buildLogReadTool } from '../log/build-log-read-tool';
import { startNextTestMemory, startTestMemory } from '../test-utils';
import { buildMockToolContext } from '../test-utils/build-mock-tool-context';
import { runExpiry } from './run-expiry';

async function setupTest() {
  const memory = await startTestMemory();

  onTestFinished(() => {
    setSystemTime();
  });

  const dayMs = 86_400_000;
  const oldAtMs = Date.UTC(2026, 0, 1);
  const nowMs = oldAtMs + 400 * dayMs;

  return {
    memory,
    dayMs,
    oldAtMs,
    nowMs,
    expire: (batchSize = 500) =>
      runExpiry(memory.expiry, { nowMs, expireAfterMs: 365 * dayMs, batchSize }),
    writeAt: async (
      atMs: number,
      kind: 'tool_result' | 'worker.turn_ended' | 'action.outcome' | 'model.reply',
      text: string,
      thread = 'conversation',
    ) => {
      setSystemTime(new Date(atMs));

      const [written] = await writeRecords(memory.log, [
        {
          kind,
          definitions: { snapshotHash: 'sha256:test' },
          thread,
          erasable: kind === 'tool_result' ? { result: { page: text } } : { text },
        },
      ]);

      return written?.sequence ?? 0;
    },
    readStatuses: async () => {
      const records = await readRecords(memory.log, {
        afterSequence: 0,
        kinds: ['tool_result', 'worker.turn_ended', 'model.reply', 'action.outcome'],
        limit: 100,
      });

      return records.map((read) => [read.record.sequence, read.record.erasable.status] as const);
    },
    readFinished: () =>
      readRecords(memory.log, { afterSequence: 0, kinds: ['erasure.finished'], limit: 5 }),
  };
}

test('it expires a tool result older than the age and keeps its record as a stub', async () => {
  const ctx = await setupTest();
  const old = await ctx.writeAt(ctx.oldAtMs + ctx.dayMs, 'tool_result', 'The locker code is 2291.');
  const recent = await ctx.writeAt(ctx.nowMs - ctx.dayMs, 'tool_result', 'The bus leaves at nine.');

  await ctx.expire();

  const statuses = await ctx.readStatuses();

  expect(statuses).toStrictEqual([
    [old, 'shredded'],
    [recent, 'readable'],
  ]);
});

test('it expires a helper note and a connector result, and leaves a reply alone', async () => {
  const ctx = await setupTest();
  const note = await ctx.writeAt(ctx.oldAtMs, 'worker.turn_ended', 'Checked the three vendors.');
  const outcome = await ctx.writeAt(ctx.oldAtMs, 'action.outcome', 'Sent the form.');
  const reply = await ctx.writeAt(ctx.oldAtMs, 'model.reply', 'It is done.');

  await ctx.expire();

  const statuses = await ctx.readStatuses();

  expect(statuses).toStrictEqual([
    [note, 'shredded'],
    [outcome, 'shredded'],
    [reply, 'readable'],
  ]);
});

test('it never expires a payload inside the span of a kept moment', async () => {
  const ctx = await setupTest();
  const before = await ctx.writeAt(ctx.oldAtMs, 'tool_result', 'Before the span.');
  const first = await ctx.writeAt(ctx.oldAtMs, 'tool_result', 'First in the span.');
  const last = await ctx.writeAt(ctx.oldAtMs, 'tool_result', 'Last in the span.');
  const after = await ctx.writeAt(ctx.oldAtMs, 'tool_result', 'After the span.');
  const otherThread = await ctx.writeAt(ctx.oldAtMs, 'tool_result', 'Same numbers.', 'other');

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    title: 'The locker hunt',
    firstSequence: first,
    lastSequence: last,
  });

  await ctx.expire();

  const statuses = await ctx.readStatuses();

  expect(kept.status).toBe('written');

  expect(statuses).toStrictEqual([
    [before, 'shredded'],
    [first, 'readable'],
    [last, 'readable'],
    [after, 'shredded'],
    [otherThread, 'shredded'],
  ]);
});

test('it finishes an expiry that stopped after its start at the next start', async () => {
  const ctx = await setupTest();
  const old = await ctx.writeAt(ctx.oldAtMs, 'tool_result', 'The locker code is 2291.');

  const begun = await ctx.memory.expiry.begin(
    { cutoffMs: ctx.nowMs - 365 * ctx.dayMs, afterSequence: 0, limit: 500 },
    { by: 'system' },
  );

  const openBefore = await readOpenErasures(ctx.memory.log);
  const statusesBefore = await ctx.readStatuses();
  const next = await startNextTestMemory(ctx.memory);
  const openAfter = await readOpenErasures(next.log);
  const expired = await readExpiredSequences(next.log, [old]);

  const records = await readRecords(next.log, {
    afterSequence: 0,
    kinds: ['tool_result'],
    limit: 5,
  });

  expect(begun.status).toBe('begun');
  expect(openBefore).toHaveLength(1);
  expect(statusesBefore).toStrictEqual([[old, 'readable']]);
  expect(openAfter).toHaveLength(0);
  expect(expired).toStrictEqual(new Set([old]));
  expect(records.map((read) => read.record.erasable.status)).toStrictEqual(['shredded']);
});

test('it expires a long backlog in batches that each finish before the next begins', async () => {
  const ctx = await setupTest();

  await ctx.writeAt(ctx.oldAtMs, 'tool_result', 'Page 0');
  await ctx.writeAt(ctx.oldAtMs, 'tool_result', 'Page 1');
  await ctx.writeAt(ctx.oldAtMs, 'tool_result', 'Page 2');
  await ctx.writeAt(ctx.oldAtMs, 'tool_result', 'Page 3');
  await ctx.writeAt(ctx.oldAtMs, 'tool_result', 'Page 4');

  const batches = await ctx.expire(2);
  const statuses = await ctx.readStatuses();
  const again = await ctx.expire();

  expect(batches).toBe(3);

  expect(statuses.map(([, status]) => status)).toStrictEqual([
    'shredded',
    'shredded',
    'shredded',
    'shredded',
    'shredded',
  ]);

  expect(again).toBe(0);
});

test('it remembers which gone keys left by expiry after the projections rebuild', async () => {
  const ctx = await setupTest();
  const old = await ctx.writeAt(ctx.oldAtMs, 'tool_result', 'The locker code is 2291.');

  await ctx.expire();

  await runProjectionRebuild(ctx.memory.log);

  const expired = await readExpiredSequences(ctx.memory.log, [old]);

  expect(expired).toStrictEqual(new Set([old]));
});

test('it shows an expired entry of log.read as expired, with no text and no error', async () => {
  const ctx = await setupTest();
  const old = await ctx.writeAt(ctx.oldAtMs, 'tool_result', 'The locker code is 2291.');

  await ctx.expire();

  const tool = buildLogReadTool(ctx.memory.log, () => Promise.resolve(new Map()));

  const outcome = await tool.run(
    { callID: 'call-1', tool: 'log.read', input: {}, toolUseID: null },
    buildMockToolContext(),
  );

  expect(outcome).toStrictEqual({
    status: 'ok',
    result: {
      entries: [
        {
          eventID: String(old),
          role: 'tool',
          recordedAt: '2026-01-01 00:00 UTC',
          text: null,
          isCut: false,
          isExpired: true,
        },
      ],
      next: null,
    },
    record: { eventIDs: [String(old)], next: null },
  });
});

test('it makes a backup due when an expiry finishes, as a forget does', async () => {
  const ctx = await setupTest();

  await ctx.writeAt(ctx.oldAtMs, 'tool_result', 'The locker code is 2291.');
  await ctx.expire();

  const finished = await ctx.readFinished();

  expect(finished.map((read) => read.record.payload['kind'])).toStrictEqual(['expiry']);
  expect(ctx.memory.effectCalls.filter((call) => call === 'writeBackupFloor')).toHaveLength(1);
});

test('it leaves no backup due when no payload is old enough', async () => {
  const ctx = await setupTest();

  await ctx.writeAt(ctx.nowMs - ctx.dayMs, 'tool_result', 'The bus leaves at nine.');
  await ctx.expire();

  const finished = await ctx.readFinished();

  expect(finished).toStrictEqual([]);
  expect(ctx.memory.effectCalls).not.toContain('writeBackupFloor');
});
