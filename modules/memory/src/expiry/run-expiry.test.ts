import { expect, test } from 'bun:test';
import { join } from 'node:path';
import { startDatabase } from '@heynixie/db';
import {
  readExpiredSequences,
  readOpenErasures,
  readRecords,
  runLogExport,
  runProjectionRebuild,
} from '@heynixie/log';
import { buildAllowingDecisionPoint } from '@heynixie/policy/test-utils';
import { writeWorkerTurnEnded } from '@heynixie/sessions';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { buildMockToolDefinition } from '@heynixie/tools/test-utils';
import { createFakeClock } from '@zgeoff/testing/clock';
import { sql } from 'kysely';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { buildLogReadTool } from '../log/build-log-read-tool';
import { startNextTestMemory, startTestMemory } from '../test-utils';
import { buildMockToolContext } from '../test-utils/build-mock-tool-context';
import { writeOwnerMessageRecord } from '../test-utils/write-owner-message-record';
import { runExpiry } from './run-expiry';

async function setupTest() {
  const dayMs = 86_400_000;
  const oldAtMs = Date.UTC(2026, 0, 1);
  const clock = createFakeClock({ startMs: oldAtMs });

  const memory = await startTestMemory({ logClock: clock, gate: { clock } });

  const lookup = buildMockToolDefinition({
    name: 'notes.lookup',
    run: (call) =>
      Promise.resolve({ status: 'ok', result: { text: String(call.input['query'] ?? '') } }),
  });

  const toolOptions = {
    registry: buildToolRegistry([lookup]),
    decide: buildAllowingDecisionPoint(),
    log: memory.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    queue: {
      enqueue: () => Promise.reject(new Error('the lookup runs direct')),
      readOpenRepeat: () => Promise.resolve(null),
      readOpenAsk: () => Promise.resolve(null),
      waitForOutcome: () => Promise.resolve(null),
    },
    queuedWaitMs: 1000,
  };

  const readToolResultSequences = async () => {
    const records = await readRecords(memory.log, {
      afterSequence: 0,
      kinds: ['tool_result'],
      limit: 100,
    });

    return records.map((read) => read.record.sequence);
  };

  return {
    memory,
    clock,
    dayMs,
    oldAtMs,
    expire: (batchSize = 500, nowMs = clock.now() + 400 * dayMs) =>
      runExpiry(memory.expiry, {
        nowMs,
        expireAfterMs: 365 * dayMs,
        batchSize,
      }),
    callLookup: async (text: string, thread = 'conversation') => {
      const before = await readToolResultSequences();

      await runToolCall(
        { tool: 'notes.lookup', input: { query: text }, toolUseID: null },
        {
          runID: `run-${thread}`,
          thread,
          logThread: thread,
          tools: ['notes.lookup'],
          model: { model: 'test-model', profile: 'standard' },
        },
        toolOptions,
      );

      const after = await readToolResultSequences();

      const sequence = after.find((candidate) => !before.includes(candidate));

      invariant(sequence !== undefined, 'the call wrote a result record');

      return sequence;
    },
    writeHelperNote: async (text: string) => {
      await writeWorkerTurnEnded(
        { log: memory.log, definitions: () => ({ snapshotHash: 'sha256:test' }) },
        {
          caller: {
            callID: 'call-1',
            callSequence: 1,
            stepRunID: 'conversation@1',
            thread: 'conversation',
            logThread: 'conversation',
          },
        },
        {
          workerRunID: crypto.randomUUID(),
          shortID: 'w7k2m9qa4x',
          model: 'test-model',
          profile: 'worker',
        },
        {
          turn: 1,
          dollars: 0,
          text,
          usage: {
            uncachedInputTokens: 10,
            cacheReadTokens: 0,
            cacheWrite5mTokens: 0,
            cacheWrite1hTokens: 0,
            outputTokens: 5,
          },
        },
      );

      const notes = await readRecords(memory.log, {
        afterSequence: 0,
        kinds: ['worker.turn_ended'],
        order: 'newest',
        limit: 1,
      });

      return notes.at(0)?.record.sequence ?? 0;
    },
    readStatuses: async () => {
      const records = await readRecords(memory.log, {
        afterSequence: 0,
        kinds: ['tool_result', 'owner_message', 'worker.turn_ended'],
        limit: 100,
      });

      return records.map((read) => [read.record.sequence, read.record.erasable.status] as const);
    },
    readFinished: () =>
      readRecords(memory.log, { afterSequence: 0, kinds: ['erasure.finished'], limit: 5 }),
    readLog: (input: Record<string, string>) =>
      buildLogReadTool(memory.log, () => Promise.resolve(new Map())).run(
        { callID: 'call-1', tool: 'log.read', input, toolUseID: null },
        buildMockToolContext(),
      ),
  };
}

test('it expires a tool result older than the age and keeps the record of the call', async () => {
  const ctx = await setupTest();
  const old = await ctx.callLookup('The locker code is 2291.');

  ctx.clock.advance(399 * ctx.dayMs);

  const recent = await ctx.callLookup('The bus leaves at nine.');

  await ctx.expire(500, ctx.clock.now());

  const calls = await readRecords(ctx.memory.log, {
    afterSequence: 0,
    kinds: ['tool_called'],
    limit: 5,
  });

  const statuses = await ctx.readStatuses();

  expect(statuses).toStrictEqual([
    [old, 'shredded'],
    [recent, 'readable'],
  ]);

  expect(calls.map((read) => read.record.erasable.status)).toStrictEqual(['readable', 'readable']);
});

test('it expires the note of a helper and leaves the record of its run', async () => {
  const ctx = await setupTest();
  const note = await ctx.writeHelperNote('Checked the three vendors.');

  await ctx.expire();

  const statuses = await ctx.readStatuses();

  expect(statuses).toStrictEqual([[note, 'shredded']]);
});

test('it never expires an owner message, however old', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'The gate code is 4471.',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  await ctx.expire();

  const statuses = await ctx.readStatuses();

  expect(statuses).toStrictEqual([[message, 'readable']]);
});

test('it never expires a payload inside the span of a kept moment', async () => {
  const ctx = await setupTest();
  const before = await ctx.callLookup('Before the span.');
  const first = await ctx.callLookup('First in the span.');
  const last = await ctx.callLookup('Last in the span.');
  const after = await ctx.callLookup('After the span.');
  const otherThread = await ctx.callLookup('Same numbers.', 'other');

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    title: 'The locker hunt',
    firstSequence: first,
    lastSequence: last,
  });

  await ctx.expire();

  expect(kept.status).toBe('written');

  const statuses = await ctx.readStatuses();

  expect(statuses).toStrictEqual([
    [before, 'shredded'],
    [first, 'readable'],
    [last, 'readable'],
    [after, 'shredded'],
    [otherThread, 'shredded'],
  ]);
});

test('it keeps the payload of a moment that is kept after the expiry began and before its keys go', async () => {
  const ctx = await setupTest();
  const first = await ctx.callLookup('First in the span.');
  const last = await ctx.callLookup('Last in the span.');

  const begun = await ctx.memory.expiry.begin(
    { cutoffMs: ctx.oldAtMs + 100 * ctx.dayMs, afterSequence: 0, limit: 500 },
    { by: 'system' },
  );

  invariant(begun.status === 'begun', 'the expiry found the old results');

  const kept = await ctx.memory.store.moments.keep({
    caller: { kind: 'owner' },
    thread: 'conversation',
    title: 'The locker hunt',
    firstSequence: first,
    lastSequence: last,
  });

  await ctx.memory.expiry.finish(begun.target.targetID);

  expect(kept.status).toBe('written');

  const statuses = await ctx.readStatuses();

  expect(statuses).toStrictEqual([
    [first, 'readable'],
    [last, 'readable'],
  ]);
});

test('it finishes an expiry that stopped after its start at the next start', async () => {
  const ctx = await setupTest();
  const old = await ctx.callLookup('The locker code is 2291.');

  const begun = await ctx.memory.expiry.begin(
    { cutoffMs: ctx.oldAtMs + 100 * ctx.dayMs, afterSequence: 0, limit: 500 },
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

  await ctx.callLookup('Page 0');
  await ctx.callLookup('Page 1');
  await ctx.callLookup('Page 2');
  await ctx.callLookup('Page 3');
  await ctx.callLookup('Page 4');

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
  const old = await ctx.callLookup('The locker code is 2291.');

  await ctx.expire();

  await runProjectionRebuild(ctx.memory.log);

  const expired = await readExpiredSequences(ctx.memory.log, [old]);

  expect(expired).toStrictEqual(new Set([old]));
});

test('it shows an expired entry of log.read as expired, with no text and no error', async () => {
  const ctx = await setupTest();
  const old = await ctx.callLookup('The locker code is 2291.');

  await ctx.expire();

  const outcome = await ctx.readLog({ record: String(old) });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { entries: [{ eventID: String(old), text: null, isExpired: true }], next: null },
  });
});

test('it answers the cursor of a long entry with the gap once the entry expires between pages', async () => {
  const ctx = await setupTest();
  const old = await ctx.callLookup('The locker code is 2291. '.repeat(2000));
  const first = await ctx.readLog({ record: String(old) });

  invariant(first.status === 'ok', 'the first page is read');

  const next = z.object({ next: z.string().nullable() }).parse(first.result).next;

  invariant(next !== null, 'the entry needs a second page');

  await ctx.expire();

  const second = await ctx.readLog({ record: String(old), after: next });

  expect(second).toMatchObject({
    status: 'ok',
    result: { entries: [{ eventID: String(old), text: null, isExpired: true }], next: null },
  });
});

test('it writes an export that marks the text of an expiry as expired and the rest as readable', async () => {
  const ctx = await setupTest();

  const message = await writeOwnerMessageRecord(ctx.memory.log, {
    thread: 'conversation',
    text: 'The gate code is 4471.',
    spans: [{ start: 0, end: 22, source: 'typed' }],
  });

  const old = await ctx.callLookup('The locker code is 2291.');

  await ctx.expire();

  const path = join(ctx.memory.dataDir, 'export.db');

  await runLogExport(ctx.memory.log, path);

  const db = startDatabase(path);

  const answer = await sql
    .raw<{ sequence: number; text_status: string }>(
      "select sequence, text_status from records where kind in ('tool_result', 'owner_message') order by sequence",
    )
    .execute(db)
    .finally(() => db.destroy());

  expect(answer.rows).toStrictEqual([
    { sequence: message, text_status: 'readable' },
    { sequence: old, text_status: 'expired' },
  ]);
});

test('it makes a backup due when an expiry finishes, as a forget does', async () => {
  const ctx = await setupTest();

  await ctx.callLookup('The locker code is 2291.');
  await ctx.expire();

  const finished = await ctx.readFinished();

  expect(finished.map((read) => read.record.payload['kind'])).toStrictEqual(['expiry']);
  expect(ctx.memory.effectCalls.filter((call) => call === 'writeBackupFloor')).toHaveLength(1);
});

test('it leaves no backup due when no payload is old enough', async () => {
  const ctx = await setupTest();

  ctx.clock.advance(399 * ctx.dayMs);

  await ctx.callLookup('The bus leaves at nine.');

  const batches = await runExpiry(ctx.memory.expiry, {
    nowMs: ctx.clock.now(),
    expireAfterMs: 365 * ctx.dayMs,
    batchSize: 500,
  });

  const finished = await ctx.readFinished();

  expect(batches).toBe(0);
  expect(finished).toStrictEqual([]);
  expect(ctx.memory.effectCalls).not.toContain('writeBackupFloor');
});
