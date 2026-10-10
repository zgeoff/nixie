import { expect, mock, onTestFinished, test } from 'bun:test';
import { appendFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { subscribeToWAL } from './subscribe-to-wal';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-wal-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir };
}

test('it calls back on a write to the WAL file and 3 more times as the commit settles', async () => {
  const ctx = await setupTest();

  await writeFile(join(ctx.dataDir, 'nixie.db-wal'), 'frame 1');

  const settled = Promise.withResolvers<number>();
  const calls = { count: 0 };
  const unsubscribe = subscribeToWAL(ctx.dataDir, () => {
    calls.count += 1;
    if (calls.count === 4) {
      settled.resolve(performance.now());
    }
  });

  onTestFinished(unsubscribe);

  const wroteAt = performance.now();

  await appendFile(join(ctx.dataDir, 'nixie.db-wal'), 'frame 2');

  const settledAt = await settled.promise;

  expect(settledAt - wroteAt).toBeGreaterThanOrEqual(250);
});

test('it ignores a write to any other file in the data directory', async () => {
  const ctx = await setupTest();

  const first = Promise.withResolvers<number>();
  const calls = { count: 0 };
  const unsubscribe = subscribeToWAL(ctx.dataDir, () => {
    calls.count += 1;
    first.resolve(calls.count);
  });

  onTestFinished(unsubscribe);
  await writeFile(join(ctx.dataDir, 'keys.db-wal'), 'frame 1');
  await writeFile(join(ctx.dataDir, 'nixie.db-shm'), 'index');

  // the kernel delivers events in order, so the WAL write's call comes after any for the others
  await writeFile(join(ctx.dataDir, 'nixie.db-wal'), 'frame 1');

  const callsAtFirst = await first.promise;

  expect(callsAtFirst).toBe(1);
});

test('it stops calling back once unsubscribed', async () => {
  const ctx = await setupTest();

  const stopped = mock<() => void>();
  const settled = Promise.withResolvers<void>();
  const calls = { count: 0 };

  subscribeToWAL(ctx.dataDir, stopped)();

  const unsubscribe = subscribeToWAL(ctx.dataDir, () => {
    calls.count += 1;
    if (calls.count === 4) {
      settled.resolve();
    }
  });

  onTestFinished(unsubscribe);
  await writeFile(join(ctx.dataDir, 'nixie.db-wal'), 'frame 1');
  await settled.promise;

  expect(stopped).not.toHaveBeenCalled();
});

test('it gives no calls and no error for a directory it cannot watch', () => {
  const onChange = mock<() => void>();

  const unsubscribe = subscribeToWAL('/nonexistent/nixie-data', onChange);

  expect(unsubscribe).not.toThrow();
  expect(onChange).not.toHaveBeenCalled();
});
