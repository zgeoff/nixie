import { join } from 'node:path';
import type { Sandbox } from '@heynixie/sandbox';

const diskUsedMarker = '.nixie-disk-used';

// Marks a disk that a move filled as used, so the guest's first call reports no new disk.
export async function writeDiskUsedMarker(
  sandbox: Sandbox,
  homeEnv: Readonly<Record<string, string>>,
): Promise<void> {
  const home = await sandbox.resolveHome(homeEnv);

  await sandbox.copyIn([{ path: join(home.copyPath, diskUsedMarker), content: new Uint8Array() }]);
}
