import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

async function setupTest() {
  // A folder beside the spike, which git ignores, keeps the test out of the system temp folder.
  const dir = await mkdtemp(join(import.meta.dir, '..', '.test-measure-'));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return {
    runMeasure: (label: string, command: readonly string[]) =>
      $`sh ${join(import.meta.dir, 'measure.sh')} ${label} ${command}`.cwd(dir).nothrow().quiet(),
  };
}

test('it reports and returns the exit status of a command that fails', async () => {
  const ctx = await setupTest();

  const result = await ctx.runMeasure('failing', ['sh', '-c', 'exit 7']);

  expect({
    exitCode: result.exitCode,
    summary: result.stdout.toString().trim().split('\n').at(-1),
  }).toStrictEqual({
    exitCode: 7,
    summary: expect.stringMatching(/^failing status=7 peak used=\d+ anon=\d+ /),
  });
});

test('it reports and returns status 0 for a command that succeeds', async () => {
  const ctx = await setupTest();

  const result = await ctx.runMeasure('passing', ['true']);

  expect({
    exitCode: result.exitCode,
    summary: result.stdout.toString().trim().split('\n').at(-1),
  }).toStrictEqual({
    exitCode: 0,
    summary: expect.stringMatching(/^passing status=0 peak used=\d+ anon=\d+ /),
  });
});
