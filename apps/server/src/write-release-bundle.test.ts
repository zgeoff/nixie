import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { testBuildIDs } from './test-build-ids';
import { writeReleaseBundle } from './write-release-bundle';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-release-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { outdir: join(directory, 'out') };
}

test('it builds a release bundle with no fault point, no test rule and no test sandbox', async () => {
  const ctx = await setupTest();
  const bundle = await writeReleaseBundle(ctx.outdir);

  expect(bundle.testBuildIDs).toStrictEqual([]);
});

test('it builds a test bundle with every test-build ID the server reaches', async () => {
  const ctx = await setupTest();
  const bundle = await writeReleaseBundle(ctx.outdir, true);

  expect(bundle.testBuildIDs).toStrictEqual(testBuildIDs);
});
