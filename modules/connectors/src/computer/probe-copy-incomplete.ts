import { join } from 'node:path';
import type { Sandbox } from '@heynixie/sandbox';
import { copyMarker } from './constants';

// True for a disk whose last copy started and never finished. A disk with no copy state was never
// a replacement, so it counts as complete.
export async function probeCopyIncomplete(
  sandbox: Sandbox,
  homeEnv: Readonly<Record<string, string>>,
): Promise<boolean> {
  const home = await sandbox.resolveHome(homeEnv);
  const names = await sandbox.readFilePaths(home.copyPath, { maxDepth: 1 });

  if (!names.includes(copyMarker)) {
    return false;
  }

  const [marker] = await sandbox.copyOut([join(home.copyPath, copyMarker)]);

  return new TextDecoder().decode(marker?.content) !== 'finished';
}
