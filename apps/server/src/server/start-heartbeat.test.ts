import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { waitFor } from '@zgeoff/testing';
import { createFakeClock } from '@zgeoff/testing/clock';
import { readHeartbeat } from './read-heartbeat';
import { startHeartbeat } from './start-heartbeat';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-heartbeat-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const clock = createFakeClock({ startMs: 5000 });
  const path = join(directory, 'run', 'heartbeat');

  return {
    clock,
    path,
    start: () => {
      const heartbeat = startHeartbeat({ path, clock, intervalMs: 1000, onError: () => {} });

      onTestFinished(() => heartbeat.stop());
    },
  };
}

test('it reads no time when no heartbeat was written', async () => {
  const ctx = await setupTest();
  const heartbeat = await readHeartbeat(ctx.path);

  expect(heartbeat).toBeNull();
});

test('it writes the time at the start', async () => {
  const ctx = await setupTest();

  ctx.start();

  await waitFor(async () => {
    const heartbeat = await readHeartbeat(ctx.path);

    expect(heartbeat).toBe(5000);
  });
});

test('it writes the time again after each interval', async () => {
  const ctx = await setupTest();

  ctx.start();

  await waitFor(async () => {
    const heartbeat = await readHeartbeat(ctx.path);

    expect(heartbeat).toBe(5000);
    expect(ctx.clock.countPending()).toBe(1);
  });

  ctx.clock.advance(1000);

  await waitFor(async () => {
    const heartbeat = await readHeartbeat(ctx.path);

    expect(heartbeat).toBe(6000);
  });
});
