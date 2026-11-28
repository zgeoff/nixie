import { expect, onTestFinished, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { startTestMemory } from '@heynixie/memory/test-utils';
import { buildAllowingDecisionPoint } from '@heynixie/policy/test-utils';
import { waitForCondition } from '@heynixie/testing';
import { buildToolRegistry, runToolCall } from '@heynixie/tools';
import { buildMockToolDefinition } from '@heynixie/tools/test-utils';
import { createFakeClock } from '@zgeoff/testing/clock';
import { startExpirySweep } from './start-expiry-sweep';

async function setupTest() {
  const dayMs = 86_400_000;
  const hourMs = 3_600_000;
  const clock = createFakeClock({ startMs: Date.UTC(2026, 0, 1) });

  const memory = await startTestMemory({ logClock: clock });

  const lookup = buildMockToolDefinition({ name: 'notes.lookup' });
  const logged: string[] = [];

  return {
    dayMs,
    hourMs,
    clock,
    memory,
    logged,
    callLookup: () =>
      runToolCall(
        { tool: 'notes.lookup', input: { query: 'locker' }, toolUseID: null },
        {
          runID: 'run-1',
          thread: 'conversation',
          logThread: 'conversation',
          tools: ['notes.lookup'],
          model: { model: 'test-model', profile: 'standard' },
        },
        {
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
        },
      ),
    startSweep: (expireAfterMs: number) =>
      startExpirySweep(
        {
          context: { clock },
          config: { erasure: { expireAfterMs } },
          log: (event) => {
            logged.push(event);
          },
          cleanup: {
            defer: (cleanup) => {
              onTestFinished(cleanup);

              return Promise.resolve();
            },
          },
        },
        { expire: memory.expiry },
      ),
    readStatuses: async () => {
      const records = await readRecords(memory.log, {
        afterSequence: 0,
        kinds: ['tool_result'],
        limit: 10,
      });

      return records.map((read) => read.record.erasable.status);
    },
  };
}

test('it expires a payload that outgrows the configured age at a later hourly pass, not at the first', async () => {
  const ctx = await setupTest();

  await ctx.callLookup();

  ctx.clock.advance(29 * ctx.dayMs);

  await ctx.startSweep(30 * ctx.dayMs);

  const atStart = await ctx.readStatuses();

  ctx.clock.advance(2 * ctx.dayMs);

  await waitForCondition(() => ctx.logged.includes('expiry.finished'));

  const atEnd = await ctx.readStatuses();

  expect(atStart).toStrictEqual(['readable']);
  expect(atEnd).toStrictEqual(['shredded']);
  expect(ctx.logged).toContain('expiry.finished');
});

test('it leaves a payload alone while the configured age has not passed', async () => {
  const ctx = await setupTest();

  await ctx.callLookup();

  ctx.clock.advance(29 * ctx.dayMs);

  await ctx.startSweep(365 * ctx.dayMs);

  ctx.clock.advance(ctx.hourMs);

  await waitForCondition(() => ctx.clock.countPending() === 1);

  const statuses = await ctx.readStatuses();

  expect(statuses).toStrictEqual(['readable']);
  expect(ctx.logged).toStrictEqual([]);
});
