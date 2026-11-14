import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRunTemplate } from '@heynixie/testing';
import { $ } from 'bun';
import { z } from 'zod';
import { readPreviousReleaseTag } from './read-previous-release-tag';

interface PreviousReleaseTimes {
  readonly worktreeMs: number;
  readonly installMs: number;
  readonly buildMs: number;
}

export interface PreviousReleaseBuild {
  readonly tag: string;
  readonly entry: string;

  // null when an earlier run built it, so the three phases did not run
  readonly times: PreviousReleaseTimes | null;
}

const repoRoot = join(import.meta.dir, '..', '..', '..', '..');

// A tag never changes, so the tag keys the build. The hash input is this file, so a change to the
// build steps builds again.
export async function readPreviousReleaseBuild(): Promise<PreviousReleaseBuild> {
  const tag = await readPreviousReleaseTag(repoRoot);

  const state: { times: PreviousReleaseTimes | null } = { times: null };

  const directory = await createRunTemplate({
    name: `nixie-previous-release-${tag}`,
    root: repoRoot,
    parentDir: join(repoRoot, 'node_modules', '.cache', 'nixie-test-bundles'),
    inputs: ['apps/server/src/test-utils/read-previous-release-build.ts'],
    write: async (building) => {
      state.times = await writeBuildOfTag(tag, join(building, 'out'));
    },
  });

  return { tag, entry: join(directory, 'out', 'main.js'), times: state.times };
}

const timesSchema = z.object({
  worktreeMs: z.number(),
  installMs: z.number(),
  buildMs: z.number(),
});

// The worktree sits outside the repo, and the build removes it and its registration whether the
// build passes or not.
async function writeBuildOfTag(tag: string, outdir: string): Promise<PreviousReleaseTimes> {
  const parent = await mkdtemp(join(tmpdir(), 'nixie-previous-release-'));

  const worktree = join(parent, 'tree');

  try {
    const worktreeMs = await timePhase(() =>
      $`git worktree add --detach ${worktree} ${tag}`.cwd(repoRoot).quiet(),
    );

    const installMs = await timePhase(() =>
      $`${process.execPath} install --frozen-lockfile --ignore-scripts`.cwd(worktree).quiet(),
    );

    await mkdir(outdir, { recursive: true });

    const buildMs = await timePhase(() =>
      $`${process.execPath} apps/server/src/run-release-build.ts ${outdir}`.cwd(worktree).quiet(),
    );

    return timesSchema.parse({ worktreeMs, installMs, buildMs });
  } finally {
    await $`git worktree remove --force ${worktree}`.cwd(repoRoot).quiet().nothrow();

    await rm(parent, { recursive: true, force: true });

    await $`git worktree prune`.cwd(repoRoot).quiet().nothrow();
  }
}

async function timePhase(run: () => PromiseLike<unknown>): Promise<number> {
  const start = performance.now();

  await run();

  return performance.now() - start;
}
