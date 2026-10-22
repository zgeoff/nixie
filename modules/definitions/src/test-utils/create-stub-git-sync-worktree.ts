import { mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface StubGitSyncWorktreeOptions {
  readonly commit: string;
  readonly config: string;
  readonly head?: string;
}

// git-sync keeps one repository at its root, checks each commit out as a linked worktree under
// `.worktrees/<commit>` with a relative gitdir, and points the `current` link at the newest.
export async function createStubGitSyncWorktree(
  root: string,
  options: StubGitSyncWorktreeOptions,
): Promise<string> {
  const gitDir = join(root, '.git', 'worktrees', options.commit);
  const worktree = join(root, '.worktrees', options.commit);
  const link = join(root, 'current');

  await mkdir(gitDir, { recursive: true });
  await mkdir(join(root, '.git', 'objects'), { recursive: true });
  await mkdir(join(root, '.git', 'refs'), { recursive: true });
  await writeFile(join(root, '.git', 'config'), options.config);
  await writeFile(join(gitDir, 'HEAD'), `${options.head ?? options.commit}\n`);
  await writeFile(join(gitDir, 'commondir'), '../..\n');
  await mkdir(worktree, { recursive: true });
  await writeFile(join(worktree, '.git'), `gitdir: ../../.git/worktrees/${options.commit}\n`);
  await rm(link, { force: true });
  await symlink(join('.worktrees', options.commit), link);

  return worktree;
}
