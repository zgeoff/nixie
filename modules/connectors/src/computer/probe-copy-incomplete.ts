import type { Sandbox } from '@heynixie/sandbox';
import { copyFinishedMarker, copyStartedMarker } from './constants';

// True for a disk whose copy started and never finished.
export async function probeCopyIncomplete(
  sandbox: Sandbox,
  homeEnv: Readonly<Record<string, string>>,
): Promise<boolean> {
  const home = await sandbox.resolveHome(homeEnv);
  const names = await sandbox.readFilePaths(home.copyPath, { maxDepth: 1 });

  return names.includes(copyStartedMarker) && !names.includes(copyFinishedMarker);
}
