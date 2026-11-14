import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { readPreviousReleaseTag } from './read-previous-release-tag';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-tags-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const git = async (...args: string[]): Promise<void> => {
    await $`git -c user.name=tester -c user.email=tester@example.test -c commit.gpgsign=false -c tag.gpgsign=false ${args}`
      .cwd(directory)
      .quiet();
  };

  await git('init', '--quiet', '--initial-branch=main');

  return {
    directory,
    git,
    commit: (message: string) => git('commit', '--allow-empty', '-m', message),
  };
}

test('it returns the newest tag merged into HEAD by version order', async () => {
  const ctx = await setupTest();

  await ctx.commit('first');
  await ctx.git('tag', 'v0.9.0');
  await ctx.commit('second');
  await ctx.git('tag', 'v0.10.0');
  await ctx.commit('third');

  const tag = await readPreviousReleaseTag(ctx.directory);

  expect(tag).toBe('v0.10.0');
});

test('it skips a tag on HEAD itself', async () => {
  const ctx = await setupTest();

  await ctx.commit('first');
  await ctx.git('tag', 'v1.0.0');
  await ctx.commit('second');
  await ctx.git('tag', '-a', 'v1.1.0', '-m', 'release');

  const tag = await readPreviousReleaseTag(ctx.directory);

  expect(tag).toBe('v1.0.0');
});

test('it skips a tag on a commit that HEAD does not hold', async () => {
  const ctx = await setupTest();

  await ctx.commit('first');
  await ctx.git('tag', 'v1.0.0');
  await ctx.git('switch', '--quiet', '-c', 'other');
  await ctx.commit('other');
  await ctx.git('tag', 'v2.0.0');
  await ctx.git('switch', '--quiet', 'main');
  await ctx.commit('second');

  const tag = await readPreviousReleaseTag(ctx.directory);

  expect(tag).toBe('v1.0.0');
});

test('it throws when no tag is merged into HEAD', async () => {
  const ctx = await setupTest();

  await ctx.commit('first');

  expect(readPreviousReleaseTag(ctx.directory)).rejects.toThrow(/no v\* tag/u);
});

test('it throws when the only tag is on HEAD', async () => {
  const ctx = await setupTest();

  await ctx.commit('first');
  await ctx.git('tag', 'v1.0.0');

  expect(readPreviousReleaseTag(ctx.directory)).rejects.toThrow(/no v\* tag/u);
});
