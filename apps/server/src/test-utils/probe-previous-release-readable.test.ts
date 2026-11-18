import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { probePreviousReleaseReadable } from './probe-previous-release-readable';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-previous-readable-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const git = async (...args: string[]): Promise<void> => {
    await $`git -c user.name=tester -c user.email=tester@example.test -c commit.gpgsign=false -c tag.gpgsign=false ${args}`
      .cwd(directory)
      .quiet();
  };

  await git('init', '--quiet', '--initial-branch=main');
  await mkdir(join(directory, 'libs', 'db', 'src', 'migrations'), { recursive: true });

  return {
    directory,
    git,
    addFile: async (name: string) => {
      await writeFile(join(directory, 'libs', 'db', 'src', 'migrations', name), '');
      await git('add', '--all');
      await git('commit', '--quiet', '-m', `add ${name}`);
    },
  };
}

test('it reads the previous release as readable when its migration count reaches the oldest reader', async () => {
  const ctx = await setupTest();

  await ctx.addFile('0001-hives-migration.ts');
  await ctx.addFile('0001-hives-migration.test.ts');
  await ctx.addFile('0002-frames-migration.ts');
  await ctx.git('tag', 'v0.1.0');
  await ctx.addFile('0003-queens-migration.ts');

  const isReadable = await probePreviousReleaseReadable({
    gitDir: ctx.directory,
    oldestReader: 2,
  });

  expect(isReadable).toBeTrue();
});

test('it reads the previous release as unreadable when its migration count is below the oldest reader', async () => {
  const ctx = await setupTest();

  await ctx.addFile('0001-hives-migration.ts');
  await ctx.addFile('0001-hives-migration.test.ts');
  await ctx.addFile('0002-frames-migration.ts');
  await ctx.git('tag', 'v0.1.0');
  await ctx.addFile('0003-queens-migration.ts');

  const isReadable = await probePreviousReleaseReadable({
    gitDir: ctx.directory,
    oldestReader: 3,
  });

  expect(isReadable).toBeFalse();
});
