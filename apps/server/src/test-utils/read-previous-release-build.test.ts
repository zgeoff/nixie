import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { $ } from 'bun';
import { readPreviousReleaseBuild } from './read-previous-release-build';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-previous-build-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const repoRoot = join(directory, 'repo');

  await mkdir(join(repoRoot, 'apps', 'server', 'src'), { recursive: true });

  const git = async (...args: string[]): Promise<void> => {
    await $`git -c user.name=tester -c user.email=tester@example.test -c commit.gpgsign=false -c tag.gpgsign=false ${args}`
      .cwd(repoRoot)
      .quiet();
  };

  await git('init', '--quiet', '--initial-branch=main');

  await Bun.write(join(repoRoot, 'package.json'), '{"name":"fixture","private":true}\n');
  await $`${process.execPath} install`.cwd(repoRoot).quiet();

  const tagRelease = async (script: string): Promise<void> => {
    await Bun.write(join(repoRoot, 'apps', 'server', 'src', 'run-release-build.ts'), script);

    await git('add', '--all');
    await git('commit', '-m', 'release');
    await git('tag', 'v1.0.0');
    await git('commit', '--allow-empty', '-m', 'next');
  };

  return {
    location: { repoRoot, parentDir: join(directory, 'cache') },
    tagWorkingRelease: () =>
      tagRelease(`import { mkdir } from 'node:fs/promises';
const outdir = process.argv[2];
await mkdir(outdir, { recursive: true });
await Bun.write(outdir + '/main.js', 'console.log("previous release");');
`),
    tagFailingRelease: () => tagRelease('process.exit(3);\n'),
    countWorktrees: async () => {
      const listing = await $`git worktree list --porcelain`.cwd(repoRoot).text();

      return listing.match(/^worktree /gmu)?.length ?? 0;
    },
    readCachedBuilds: async () => {
      const entries = await readdir(join(directory, 'cache'));

      return entries.filter((entry) => !entry.endsWith('.building'));
    },
  };
}

test('it builds the previous release from a worktree of its tag and removes the worktree', async () => {
  const ctx = await setupTest();

  await ctx.tagWorkingRelease();

  const build = await readPreviousReleaseBuild(ctx.location);
  const entryText = await Bun.file(build.entry).text();
  const worktreeCount = await ctx.countWorktrees();

  expect(build).toStrictEqual({
    tag: 'v1.0.0',
    entry: expect.stringMatching(/\/out\/main\.js$/u),
    times: {
      worktreeMs: expect.toBeNumber(),
      installMs: expect.toBeNumber(),
      buildMs: expect.toBeNumber(),
    },
  });

  expect(entryText).toBe('console.log("previous release");');
  expect(worktreeCount).toBe(1);
});

test('it reuses a cached build and reports that no phase ran', async () => {
  const ctx = await setupTest();

  await ctx.tagWorkingRelease();

  const first = await readPreviousReleaseBuild(ctx.location);
  const second = await readPreviousReleaseBuild(ctx.location);

  expect(second).toStrictEqual({ tag: 'v1.0.0', entry: first.entry, times: null });
});

test('it removes the worktree and caches nothing when the build fails', async () => {
  const ctx = await setupTest();

  await ctx.tagFailingRelease();

  await expect(readPreviousReleaseBuild(ctx.location)).rejects.toThrow();

  const worktreeCount = await ctx.countWorktrees();
  const cached = await ctx.readCachedBuilds();

  expect(worktreeCount).toBe(1);
  expect(cached).toStrictEqual([]);
});
