import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildTestClock, waitForCondition } from '@heynixie/testing';
import { startReadinessRefresh } from './start-readiness-refresh';

async function setupTest() {
  const dataDir = await mkdtemp(join(tmpdir(), 'nixie-readiness-refresh-'));

  onTestFinished(() => rm(dataDir, { recursive: true, force: true }));

  const clock = buildTestClock(0);

  return { dataDir, clock };
}

test('it reports impd that does not answer as an unready imp runtime', async () => {
  const ctx = await setupTest();

  const refresh = startReadinessRefresh(
    { checkRuntime: () => Promise.resolve({ isReady: false, reason: 'impd does not answer' }) },
    ctx.dataDir,
    ctx.clock,
  );

  onTestFinished(() => refresh.stop());

  await waitForCondition(
    () => refresh.read('imp_runtime').reason !== 'the part is not checked yet',
  );

  expect(refresh.read('imp_runtime')).toStrictEqual({
    isReady: false,
    reason: 'impd does not answer',
  });
});
