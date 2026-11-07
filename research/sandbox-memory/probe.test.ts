import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

async function setupTest() {
  // A folder beside the spike, which git ignores, keeps the test out of the system temp folder.
  const dir = await mkdtemp(join(import.meta.dir, '.test-probe-'));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  const stubPath = join(dir, 'impz');
  // The stub answers every impz command but rm, which fails as a refused removal would.
  await writeFile(stubPath, '#!/usr/bin/env bash\n[ "$1" = rm ] && exit 1\necho /home/stub\n');
  await chmod(stubPath, 0o755);

  return {
    runProbe: () =>
      $`bash ${join(import.meta.dir, 'probe.sh')} ${'stub-image'} ${'192'} ${'1'} ${'idle.sh'}`
        .env({ ...process.env, PATH: `${dir}:${process.env['PATH']}` })
        .nothrow()
        .quiet(),
  };
}

test('it reports a failed removal of the test imp and exits 1', async () => {
  const ctx = await setupTest();

  const result = await ctx.runProbe();

  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toStrictEqual({
    exitCode: 1,
    stderr: expect.stringMatching(
      /^probe\.sh: failed to remove the test imp; remove it with: impz rm memprobe-192-\d+\n$/,
    ),
  });
});
