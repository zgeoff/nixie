import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildReleaseBundle } from './build-release-bundle';
import { testBuildIDs } from './test-build-ids';
import { startTestNixie } from './test-utils/start-test-nixie';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-release-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { outdir: join(dir, 'out') };
}

test('it builds a release bundle with no fault point, no test rule and no process double', async () => {
  const ctx = await setupTest();

  const bundle = await buildReleaseBundle(ctx.outdir);
  const text = await Bun.file(join(ctx.outdir, 'main.js')).text();

  expect(bundle.testBuildIDs).toStrictEqual([]);
  expect(text).not.toInclude('the tool relay has no TCP address');
}, 60_000);

test('it builds a test bundle with every test-build ID the server reaches', async () => {
  const ctx = await setupTest();

  const bundle = await buildReleaseBundle(ctx.outdir, true);

  // no slice 1 server path queues an action until the crash tests wire their send tool, so the
  // bundler drops the queue's fault points from the server; create-allowed-action.test.ts covers them
  expect(bundle.testBuildIDs).toStrictEqual(
    testBuildIDs.filter((id) => !id.startsWith('queue.commit.')),
  );
}, 60_000);

test('it builds a release bundle that answers live, and not ready while impd does not answer', async () => {
  const ctx = await setupTest();

  await buildReleaseBundle(ctx.outdir);

  const nixie = await startTestNixie({ entry: join(ctx.outdir, 'main.js') });
  const [listening] = await Promise.all([
    nixie.waitForLogEvent('http.listening'),
    nixie.waitForLogEvent('start.retry'),
  ]);
  const [live, ready] = await Promise.all([
    fetch(`http://127.0.0.1:${String(listening['port'])}/health/live`),
    fetch(`http://127.0.0.1:${String(listening['port'])}/health/ready`),
  ]);

  expect(live.status).toBe(200);
  expect(ready.status).toBe(503);
  expect(ready.json()).resolves.toMatchObject({
    parts: { imp_host: { isReady: false, reason: 'impd does not answer' } },
  });
}, 60_000);

test('it builds a release bundle that exits 0 on SIGTERM', async () => {
  const ctx = await setupTest();

  await buildReleaseBundle(ctx.outdir);

  const nixie = await startTestNixie({ entry: join(ctx.outdir, 'main.js') });

  await nixie.waitForLogEvent('http.listening');
  nixie.sendSignal('SIGTERM');

  expect(nixie.exited).resolves.toBe(0);
}, 60_000);
