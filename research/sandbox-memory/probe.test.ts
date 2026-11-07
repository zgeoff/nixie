import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

async function setupTest() {
  // A folder beside the spike, which git ignores, keeps the test out of the system temp folder.
  const dir = await mkdtemp(join(import.meta.dir, '.test-probe-'));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  const stubPath = join(dir, 'impz');
  const logPath = join(dir, 'calls.log');
  // The stub logs each impz command, and exits 5 for each command that STUB_FAIL names.
  await writeFile(
    stubPath,
    '#!/usr/bin/env bash\necho "$1" >> "$STUB_LOG"\ncase " $STUB_FAIL " in *" $1 "*) exit 5 ;; esac\necho /home/stub\n',
  );
  await chmod(stubPath, 0o755);

  return {
    runProbe: (failingCommands: string) =>
      $`bash ${join(import.meta.dir, 'probe.sh')} ${'stub-image'} ${'192'} ${'1'} ${'idle.sh'}`
        .env({
          ...process.env,
          PATH: `${dir}:${process.env['PATH']}`,
          STUB_LOG: logPath,
          STUB_FAIL: failingCommands,
        })
        .nothrow()
        .quiet(),
    readCalls: async () => (await readFile(logPath, 'utf8')).trim().split('\n'),
  };
}

test('it reports a failed removal of the test imp and exits 1', async () => {
  const ctx = await setupTest();

  const result = await ctx.runProbe('rm');

  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toStrictEqual({
    exitCode: 1,
    stderr: expect.stringMatching(
      /^probe\.sh: failed to remove the test imp; remove it with: impz rm memprobe-192-\d+\n$/,
    ),
  });
});

test('it keeps the status of a failed scenario when the removal fails too', async () => {
  const ctx = await setupTest();

  const result = await ctx.runProbe('exec rm');

  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toStrictEqual({
    exitCode: 5,
    stderr: expect.stringMatching(/^probe\.sh: failed to remove the test imp; /),
  });
});

test('it removes no imp when the create fails', async () => {
  const ctx = await setupTest();
  await ctx.runProbe('new');

  expect(await ctx.readCalls()).toStrictEqual(['ls', 'new']);
});
