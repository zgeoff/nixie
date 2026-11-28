import { join } from 'node:path';
import type { Sandbox } from '@heynixie/sandbox';
import { copyFinishedMarker } from './constants';

// Marks a disk whose copies all passed their check.
export async function writeCopyFinished(
  sandbox: Sandbox,
  homeEnv: Readonly<Record<string, string>>,
): Promise<void> {
  const home = await sandbox.resolveHome(homeEnv);

  await sandbox.copyIn([
    { path: join(home.copyPath, copyFinishedMarker), content: new Uint8Array() },
  ]);
}
