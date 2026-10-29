import { chmod, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// The job runs restic as a binary on a path, so the stand-in is a script that starts the stub
// under the Bun that runs the test.
export async function createStubRestic(directory: string): Promise<string> {
  const path = join(directory, 'restic');
  const stub = join(import.meta.dir, 'run-stub-restic.ts');

  await writeFile(path, `#!/bin/sh\nexec "${process.execPath}" "${stub}" "$@"\n`);
  await chmod(path, 0o755);

  return path;
}
