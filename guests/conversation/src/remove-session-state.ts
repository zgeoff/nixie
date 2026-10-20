import { access, rm } from 'node:fs/promises';
import { getConfigDir } from './get-config-dir';
import { getWorkDir } from './get-work-dir';

// Removes the guest's whole session state, the CLI's config folder and the working directory, and
// checks that both are gone. A forget runs it once no CLI is left to write, because the SDK keeps
// forgotten text in every fork and before every compaction boundary, so no single file can go.
export async function removeSessionState(home: string): Promise<void> {
  const paths = [getConfigDir(home), getWorkDir(home)];

  // a removal that fails leaves its path on disk, which the check below reports
  await Promise.allSettled(paths.map((path) => rm(path, { recursive: true, force: true })));

  const left = await Promise.all(paths.map((path) => readPresentPath(path)));

  if (left.flat().length > 0) {
    throw new Error(`the session state is still on disk at ${left.flat().join(', ')}`);
  }
}

// Only a missing path proves the removal; any other failure to check, such as a home the guest
// cannot traverse, throws, so the forget never completes on an unproven removal.
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
