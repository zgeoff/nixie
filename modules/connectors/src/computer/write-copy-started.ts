import { join } from 'node:path';
import type { Sandbox } from '@heynixie/sandbox';
import { copyStartedMarker } from './constants';

// Marks a disk that a copy starts to fill, so a later call never takes it for a source or a kept
// disk until a finish mark follows.
export async function writeCopyStarted(
  sandbox: Sandbox,
  homeEnv: Readonly<Record<string, string>>,
): Promise<void> {
  const home = await sandbox.resolveHome(homeEnv);

  await sandbox.copyIn([
    { path: join(home.copyPath, copyStartedMarker), content: new Uint8Array() },
  ]);
}
