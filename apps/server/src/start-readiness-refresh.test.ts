import { expect, mock, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildHealthApp } from '@heynixie/ops';
import type { RuntimeReport } from '@heynixie/sandbox';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { buildReadinessChecks } from './build-readiness-checks';
import { buildStartState } from './build-start-state';
import { startReadinessRefresh } from './start-readiness-refresh';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-readiness-refresh-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const clock = buildTestClock(0);

  return { dataDir, clock };
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
  const refresh = startReadinessRefresh({ checkRuntime }, ctx.dataDir, ctx.clock);

  onTestFinished(async () => {
    ctx.clock.advance(2000);

    await refresh.stop();
  });

  const app = buildHealthApp({
    liveness: {
      process: () => Promise.resolve({ isReady: true, reason: null }),
      database: () => Promise.resolve({ isReady: true, reason: null }),
    },
    ...buildReadinessChecks(state, refresh),
  });

  // the first round's report lands just before the interval's sleep starts
  await waitForCondition(() => refresh.read('imp_runtime').isReady && refresh.read('disk').isReady);

  runtime.next = Promise.withResolvers<RuntimeReport>().promise;

  ctx.clock.advance(5000);

  await waitForCondition(() => checkRuntime.mock.calls.length === 2);

  const responses = await Promise.all(
    Array.from({ length: 3 }, () => app.handle(new Request('http://nixie.test/health/ready'))),
  );

  expect(responses.map((response) => response.status)).toStrictEqual([200, 200, 200]);
  expect(checkRuntime).toHaveBeenCalledTimes(2);
});
