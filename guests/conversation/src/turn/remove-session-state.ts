import { access, rm } from 'node:fs/promises';
import { getConfigDir } from './get-config-dir';
import { getWorkDir } from './get-work-dir';

// The SDK keeps forgotten text in every fork and before every compaction boundary, so a forget
// removes the whole session state, never a single file.
export async function removeSessionState(home: string): Promise<void> {
  const paths = [getConfigDir(home), getWorkDir(home)];

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
