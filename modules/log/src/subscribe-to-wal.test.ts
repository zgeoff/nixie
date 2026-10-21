import { expect, mock, onTestFinished, test } from 'bun:test';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { subscribeToWAL } from './subscribe-to-wal';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-wal-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir, clock: buildTestClock(1_700_000_000_000) };
}

test('it calls back on a write to the WAL file and 3 more times as the commit settles', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie.db-wal'), 'frame 1');

  const onChange = mock<() => void>();

  onTestFinished(subscribeToWAL(ctx.dataDir, ctx.clock, onChange));

  await appendFile(join(ctx.dataDir, 'nixie.db-wal'), 'frame 2');
  await waitForCondition(() => ctx.clock.countSleepers() === 3);

  const callsBeforeSettle = onChange.mock.calls.length;

  ctx.clock.advance(250);

  await waitForCondition(() => onChange.mock.calls.length >= callsBeforeSettle + 3);

  expect(onChange.mock.calls.length - callsBeforeSettle).toBe(3);
});

test('it ignores a write to any other file in the data directory', async () => {
  const ctx = await setupTest();

  const first = Promise.withResolvers<number>();
  const calls = { count: 0 };

  const unsubscribe = subscribeToWAL(ctx.dataDir, ctx.clock, () => {
    calls.count += 1;

    first.resolve(calls.count);
  });

  onTestFinished(unsubscribe);

  await writeFile(join(ctx.dataDir, 'keys.db-wal'), 'frame 1');
  await writeFile(join(ctx.dataDir, 'nixie.db-shm'), 'index');
  await writeFile(join(ctx.dataDir, 'nixie.db-wal'), 'frame 1');

  const callsAtFirst = await first.promise;

  expect(callsAtFirst).toBe(1);
});

test('it stops calling back once unsubscribed', async () => {
  const ctx = await setupTest();

  const stopped = mock<() => void>();
  const live = mock<() => void>();

  subscribeToWAL(ctx.dataDir, ctx.clock, stopped)();
  onTestFinished(subscribeToWAL(ctx.dataDir, ctx.clock, live));

  await writeFile(join(ctx.dataDir, 'nixie.db-wal'), 'frame 1');
  await waitForCondition(() => ctx.clock.countSleepers() === 3);

  ctx.clock.advance(250);

  await waitForCondition(() => live.mock.calls.length >= 4);

  expect(stopped).not.toHaveBeenCalled();
});

test('it gives no calls and no error for a directory it cannot watch', () => {
  const clock = buildTestClock(1_700_000_000_000);
  const onChange = mock<() => void>();
  const unsubscribe = subscribeToWAL('/nonexistent/nixie-data', clock, onChange);

  expect(unsubscribe).not.toThrow();
  expect(onChange).not.toHaveBeenCalled();
});
