import { join } from 'node:path';
import type { Sandbox } from '@heynixie/sandbox';
import { copyMarker } from './constants';

export type CopyState = 'started' | 'finished';

// Writes the copy state of a replacement disk. A started state replaces any earlier finished one,
// so a disk that a later copy overwrites is never a source or a kept disk until it finishes again.
export async function writeCopyState(
  sandbox: Sandbox,
  homeEnv: Readonly<Record<string, string>>,
  state: CopyState,
): Promise<void> {
  const home = await sandbox.resolveHome(homeEnv);

  await sandbox.copyIn([
    { path: join(home.copyPath, copyMarker), content: new TextEncoder().encode(state) },
  ]);
}
