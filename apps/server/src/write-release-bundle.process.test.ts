import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnTestNixie } from './test-utils/spawn-test-nixie';
import { writeReleaseBundle } from './write-release-bundle';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-release-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { outdir: join(directory, 'out') };
}

test('it builds a release bundle that answers live, and degraded while impd does not answer', async () => {
  const ctx = await setupTest();

  await writeReleaseBundle(ctx.outdir);

  const nixie = await spawnTestNixie({ entry: join(ctx.outdir, 'main.js') });

  const [listening] = await Promise.all([
    nixie.waitForLogEvent('http.listening'),
    nixie.waitForLogEvent('start.retry'),
  ]);

  const [live, ready] = await Promise.all([
    fetch(`http://127.0.0.1:${String(listening['port'])}/health/live`),
    fetch(`http://127.0.0.1:${String(listening['port'])}/health/ready`),
  ]);

  expect(live.status).toBe(200);
  expect(ready.status).toBe(200);

  expect(ready.json()).resolves.toMatchObject({
    status: 'degraded',
    dependencies: { imp_host: { isReady: false, reason: 'impd does not answer' } },
  });
});

test('it builds a release bundle that exits 0 on SIGTERM', async () => {
  const ctx = await setupTest();

  await writeReleaseBundle(ctx.outdir);

  const nixie = await spawnTestNixie({ entry: join(ctx.outdir, 'main.js') });

  await nixie.waitForLogEvent('http.listening');

  nixie.sendSignal('SIGTERM');

  expect(nixie.exited).resolves.toBe(0);
});
