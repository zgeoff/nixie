import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { createStubGitSyncWorktree } from './create-stub-git-sync-worktree';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-stub-git-sync-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { directory: await realpath(directory) };
}

test('it lays out a linked worktree that git reads at the commit, with its origin', async () => {
  const ctx = await setupTest();

  await createStubGitSyncWorktree(ctx.directory, {
    commit: '7c1e9a4b2f0d8e6c3a5b7d9f1e2c4a6b8d0f3e57',
    config: '[remote "origin"]\n\turl = https://git.example.test/reed-co/heron-definitions\n',
  });

  const current = join(ctx.directory, 'current');

  const commonDir = await $`git rev-parse --path-format=absolute --git-common-dir`
    .cwd(current)
    .text();

  const head = await $`git rev-parse HEAD`.cwd(current).text();
  const origin = await $`git config --get remote.origin.url`.cwd(current).text();

  expect(commonDir.trim()).toBe(join(ctx.directory, '.git'));
  expect(head.trim()).toBe('7c1e9a4b2f0d8e6c3a5b7d9f1e2c4a6b8d0f3e57');
  expect(origin.trim()).toBe('https://git.example.test/reed-co/heron-definitions');
});

test('it points the current link at the newest worktree', async () => {
  const ctx = await setupTest();

  await createStubGitSyncWorktree(ctx.directory, {
    commit: '7c1e9a4b2f0d8e6c3a5b7d9f1e2c4a6b8d0f3e57',
    config: '[remote "origin"]\n\turl = https://git.example.test/reed-co/heron-definitions\n',
  });

  const newest = await createStubGitSyncWorktree(ctx.directory, {
    commit: 'e04b6d8f2a1c3e5b7d9f0a2c4e6b8d1f3a5c7e90',
    config: '[remote "origin"]\n\turl = https://git.example.test/reed-co/heron-definitions\n',
  });

  const current = await realpath(join(ctx.directory, 'current'));

  expect(current).toBe(newest);
});
