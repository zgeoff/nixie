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

test('the release bundle holds no fault point, no test rule and no process double', async () => {
  const ctx = await setupTest();

  const bundle = await buildReleaseBundle(ctx.outdir);
  const text = await Bun.file(join(ctx.outdir, 'main.js')).text();

  expect(bundle.testBuildIDs).toStrictEqual([]);
  expect(text).not.toInclude('the tool relay has no TCP address');
}, 60_000);

test('a test build holds every test-build ID the server reaches, so the list matches the code', async () => {
  const ctx = await setupTest();

  const bundle = await buildReleaseBundle(ctx.outdir, true);

  // no slice 1 server path queues an action until the crash tests wire their send tool, so the
  // bundler drops the queue's fault points from the server; fault-points.test.ts covers them
  expect(bundle.testBuildIDs).toStrictEqual(
    testBuildIDs.filter((id) => !id.startsWith('queue.commit.')),
  );
}, 60_000);

test('the release build exits 0 and writes the server and its SQLite worker', async () => {
  const ctx = await setupTest();

  const build = Bun.spawnSync([
    process.execPath,
    join(import.meta.dir, 'run-release-build.ts'),
    ctx.outdir,
  ]);

  expect(build.exitCode).toBe(0);
  expect(build.stdout.toString()).toBe(
    'the release bundle holds main.js, sqlite-worker.js, with no test-build ID\n',
  );
}, 60_000);

test('the release bundle starts live behind its health endpoint and stops on SIGTERM', async () => {
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
  nixie.sendSignal('SIGTERM');

  expect(live.status).toBe(200);
  expect(ready.status).toBe(503);
  expect(ready.json()).resolves.toMatchObject({
    parts: { imp_host: { isReady: false, reason: expect.toStartWith('impd does not answer') } },
  });
  expect(nixie.exited).resolves.toBe(0);
}, 60_000);
