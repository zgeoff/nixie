import { access, rm } from 'node:fs/promises';
import { getCodexHome } from './get-codex-home';
import { getWorkDir } from './get-work-dir';

// The CLI keeps forgotten text in its sessions, history and state databases, so a forget
// removes the whole session state, never a single file.
export async function removeSessionState(home: string): Promise<void> {
  const paths = [getCodexHome(home), getWorkDir(home)];

  await Promise.allSettled(paths.map((path) => rm(path, { recursive: true, force: true })));

  const left = await Promise.all(paths.map((path) => readPresentPath(path)));

  if (left.flat().length > 0) {
    throw new Error(`the session state is still on disk at ${left.flat().join(', ')}`);
  }
}

async function readPresentPath(path: string): Promise<readonly string[]> {
  try {
    await access(path);

    return [path];
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return [];
    }

    throw error;
  }
}
