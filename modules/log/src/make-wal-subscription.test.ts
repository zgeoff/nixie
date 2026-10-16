import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { makeWALSubscription } from './make-wal-subscription';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-wal-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  return { dataDir, clock: buildTestClock(1_700_000_000_000) };
}

test('it calls back on each poll when no WAL change arrives', async () => {
  const ctx = await setupTest();

  const onChange = mock<() => void>();

  const subscribe = makeWALSubscription(
    { dataDir: ctx.dataDir, clock: ctx.clock },
    { pollMs: 1000 },
  );

  onTestFinished(subscribe(onChange));

  ctx.clock.advance(1000);

  await waitForCondition(() => onChange.mock.calls.length === 1);
  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(1000);

  await waitForCondition(() => onChange.mock.calls.length === 2);

  expect(onChange).toHaveBeenCalledTimes(2);
});

test('it calls back when the WAL file changes', async () => {
  const ctx = await setupTest();

  const onChange = mock<() => void>();

  onTestFinished(makeWALSubscription({ dataDir: ctx.dataDir, clock: ctx.clock })(onChange));

  await writeFile(join(ctx.dataDir, 'nixie.db-wal'), 'frame 1');
  await waitForCondition(() => onChange.mock.calls.length > 0);

  expect(ctx.clock.now()).toBe(1_700_000_000_000);
});

test('it ends the poll and the watch once unsubscribed', async () => {
  const ctx = await setupTest();

  const onChange = mock<() => void>();

  makeWALSubscription({ dataDir: ctx.dataDir, clock: ctx.clock })(onChange)();

  await writeFile(join(ctx.dataDir, 'nixie.db-wal'), 'frame 1');

  ctx.clock.advance(1000);

  expect(ctx.clock.countSleepers()).toBe(0);
  expect(onChange).not.toHaveBeenCalled();
});
