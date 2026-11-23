import { expect, test } from 'bun:test';
import { readRecords } from '@heynixie/log';
import { createFakeClock } from '@zgeoff/testing/clock';
import { startTestLog } from '../../test-utils/start-test-log';
import { endTakeoverCutByRestart } from './end-takeover-cut-by-restart';
import { makeTakeoverRecords } from './make-takeover-records';

async function setupTest() {
  const clock = createFakeClock({ startMs: 1_700_000_000_000 });

  const log = await startTestLog(clock);

  const records = makeTakeoverRecords({
    log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
  });

  return {
    clock,
    records,
    endCutHold: () => endTakeoverCutByRestart(log, records),
    readAll: () => readRecords(log, { afterSequence: 0, limit: 10 }),
  };
}

test('it writes a restart end for a hold that was open when nixie stopped', async () => {
  const ctx = await setupTest();

  await ctx.records.writeStarted({ device: 'laptop' });

  ctx.clock.advance(125_000);

  await ctx.endCutHold();

  const entries = await ctx.readAll();

  expect(entries.map((entry) => entry.record.kind)).toStrictEqual([
    'computer.takeover_started',
    'computer.takeover_ended',
  ]);

  expect(entries[1]?.record).toMatchObject({
    payload: { by: 'restart', durationSeconds: 125 },
    erasable: { status: 'readable', fields: { origins: [], now: null } },
  });
});

test('it writes nothing when no hold was open', async () => {
  const ctx = await setupTest();

  await ctx.records.writeStarted({ device: 'laptop' });
  await ctx.records.writeEnded({ by: 'user', durationSeconds: 3, read: null });
  await ctx.endCutHold();

  const entries = await ctx.readAll();

  expect(entries).toHaveLength(2);
});
