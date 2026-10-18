import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWriter } from '@heynixie/log';
import type { RuntimeReport } from '@heynixie/sandbox';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { buildCleanup } from './build-cleanup';
import { buildStartState } from './build-start-state';
import { startServerHealth } from './start-server-health';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-server-health-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const writer = await startWriter({ dataDir });

  onTestFinished(() => writer.stop());

  const clock = buildTestClock(0);
  const cleanup = buildCleanup();

  // the test clock never reaches a hung check's timeout by itself, so the stop advances it
  onTestFinished(() => {
    clock.advance(2000);

    return cleanup.stop();
  });

  return { dataDir, writer, clock, cleanup };
}

test('it answers readiness from the last impd report while a later impd check hangs', async () => {
  const ctx = await setupTest();

  const state = buildStartState({ isReady: true, reason: null });

  state.update({
    definitions: { isReady: true, reason: null },
    areImagesAdded: true,
    conversation: { isReady: true, reason: null },
    areRunnersStarted: true,
  });

  const runtime = { next: Promise.resolve<RuntimeReport>({ isReady: true, reason: null }) };
  const checkRuntime = mock(() => runtime.next);

  const app = await startServerHealth({
    writer: ctx.writer,
    state,
    adapter: { checkRuntime },
    dataDir: ctx.dataDir,
    clock: ctx.clock,
    cleanup: ctx.cleanup,
  });

  // readiness answers 200 once the first round's reports land, just before the interval's sleep
  await waitForCondition(async () => {
    const response = await app.handle(new Request('http://nixie.test/health/ready'));

    return response.status === 200;
  });

  runtime.next = Promise.withResolvers<RuntimeReport>().promise;

  ctx.clock.advance(5000);

  await waitForCondition(() => checkRuntime.mock.calls.length === 2);

  const responses = await Promise.all(
    Array.from({ length: 3 }, () => app.handle(new Request('http://nixie.test/health/ready'))),
  );

  expect(responses.map((response) => response.status)).toStrictEqual([200, 200, 200]);
  expect(checkRuntime).toHaveBeenCalledTimes(2);
});
