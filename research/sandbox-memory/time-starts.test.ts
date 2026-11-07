import { expect, onTestFinished, test } from 'bun:test';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

async function setupTest() {
  // A folder beside the spike, which git ignores, keeps the test out of the system temp folder.
  const dir = await mkdtemp(join(import.meta.dir, '.test-time-starts-'));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));
  const stubPath = join(dir, 'impz');
  const logPath = join(dir, 'calls.log');
  // The stub logs each impz command, and exits 5 for each command that STUB_FAIL names.
  await writeFile(
    stubPath,
    '#!/usr/bin/env bash\necho "$1" >> "$STUB_LOG"\ncase " $STUB_FAIL " in *" $1 "*) exit 5 ;; esac\nexit 0\n',
  );
  await chmod(stubPath, 0o755);

  return {
    runTimeStarts: (failingCommands: string) =>
      $`bash ${join(import.meta.dir, 'time-starts.sh')} ${'stub-image'} ${'192'} ${'1'} ${'1'}`
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

test('it reports a failed removal of a timing imp and exits 1', async () => {
  const ctx = await setupTest();

  const result = await ctx.runTimeStarts('rm');

  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toStrictEqual({
    exitCode: 1,
    stderr: expect.stringMatching(
      /^time-starts\.sh: failed to remove the test imp; remove it with: impz rm memprobe-time-\d+-1\n$/,
    ),
  });
});

test('it keeps the status of a failed timing when the removal fails too', async () => {
  const ctx = await setupTest();

  const result = await ctx.runTimeStarts('exec rm');

  expect({ exitCode: result.exitCode, stderr: result.stderr.toString() }).toStrictEqual({
    exitCode: 5,
    stderr: expect.stringMatching(/^time-starts\.sh: failed to remove the test imp; /),
  });
});

test('it removes no imp when the create fails', async () => {
  const ctx = await setupTest();
  await ctx.runTimeStarts('new');

  expect(await ctx.readCalls()).toStrictEqual(['ls', 'new']);
});

test('it prints one timing line when every command succeeds', async () => {
  const ctx = await setupTest();

  const result = await ctx.runTimeStarts('');

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 0,
    stdout: expect.stringMatching(
      /^run=1 image=stub-image memoryMib=192 create_to_exec_ms=\d+ wake1_to_exec_ms=\d+ wake2_to_exec_ms=\d+\n$/,
    ),
  });
});
