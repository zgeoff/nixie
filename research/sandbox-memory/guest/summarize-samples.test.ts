import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { $ } from 'bun';

async function setupTest() {
  // A folder beside the spike, which git ignores, keeps the test out of the system temp folder.
  const dir = await mkdtemp(join(import.meta.dir, '..', '.test-summarize-'));
  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return {
    writeSamples: (lines: string) => writeFile(join(dir, 'samples.txt'), lines),
    runSummarize: (cgroup: { peakBytes: string; maxBytes: string; hits: string }) =>
      $`sh ${join(import.meta.dir, 'summarize-samples.sh')} ${'fetch1'} ${'0'} ${cgroup.peakBytes} ${cgroup.maxBytes} ${cgroup.hits} ${join(dir, 'samples.txt')}`
        .nothrow()
        .quiet(),
  };
}

test('it prints the peak of each memory figure across the samples', async () => {
  const ctx = await setupTest();
  await ctx.writeSamples(
    [
      '1794026931000 used=48 anon=21 bun=38/12 imp-agent=9/4 ',
      '1794026931050 used=97 anon=68 bun=81/60 imp-agent=10/4 ',
      '1794026931100 used=73 anon=40 bun=57/33 ',
      '',
    ].join('\n'),
  );

  const result = await ctx.runSummarize({ peakBytes: '104857600', maxBytes: '105115648', hits: '39' });

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 0,
    stdout:
      'fetch1 status=0 peak used=97 anon=68 cgroup_peak=100 cgroup_max=100 cgroup_max_hits=39 samples=3 bun=81 imp-agent=10\n',
  });
});

test('it keeps a cgroup with no limit as max', async () => {
  const ctx = await setupTest();
  await ctx.writeSamples('1794026931000 used=47 anon=21 bun=41/18 \n');

  const result = await ctx.runSummarize({ peakBytes: '62914560', maxBytes: 'max', hits: '0' });

  expect({ exitCode: result.exitCode, stdout: result.stdout.toString() }).toStrictEqual({
    exitCode: 0,
    stdout:
      'fetch1 status=0 peak used=47 anon=21 cgroup_peak=60 cgroup_max=max cgroup_max_hits=0 samples=1 bun=41\n',
  });
});
