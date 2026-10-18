import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildImpPort, buildImpSandboxAdapter } from '@heynixie/sandbox-imp';
import { setupTestRecorder } from '@heynixie/sandbox/test-utils';
import { buildStubCheck, buildTestClock, waitForCondition } from '@heynixie/testing';
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

test('it reports the imp runtime ready once impd answers again after a call that never settles', async () => {
  const ctx = await setupTest();
  const recorder = await setupTestRecorder();

  // a half-open connection: impd takes the first call and never answers it
  const answer = buildStubCheck(() => Promise.withResolvers<Response>().promise);
  const impd = Bun.serve({ port: 0, hostname: '127.0.0.1', fetch: () => answer.check() });

  onTestFinished(() => impd.stop(true));

  const adapter = buildImpSandboxAdapter({
    port: buildImpPort({ url: impd.url.href, token: 'not-a-real-token' }),
    recorder: recorder.recorder,
    config: { publicEgress: null },
    toolTarget: () => ({ path: '/nonexistent/tools.sock' }),
  });

  const refresh = startReadinessRefresh(adapter, ctx.dataDir, ctx.clock);

  onTestFinished(() => refresh.stop());

  await waitForCondition(() => answer.check.mock.calls.length === 1);

  ctx.clock.advance(2000);

  await waitForCondition(
    () => refresh.read('imp_runtime').reason === 'the check took longer than 2000 ms',
  );

  // impd answers every oRPC call in the RPC protocol's envelope, and only system.info reaches it
  answer.answerWith(() =>
    Promise.resolve(Response.json({ json: { version: '1.6.0', features: {}, egress: {} } })),
  );

  await waitForCondition(() => ctx.clock.countSleepers() === 1);

  ctx.clock.advance(5000);

  await waitForCondition(() => refresh.read('imp_runtime').isReady);

  // one call each round: the hung one, then the one impd answers
  expect(answer.check).toHaveBeenCalledTimes(2);
});
