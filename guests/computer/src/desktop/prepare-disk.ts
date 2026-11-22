import { chmod, chown, mkdir } from 'node:fs/promises';
import type { DiskEntry } from './build-disk-entries';

// Creates the home, the profile and the files, and gives each its owner and mode. A copy that the
// server made, such as the move from an earlier release, wrote its files as root, so a start sets
// the owners again.
export async function prepareDisk(entries: readonly DiskEntry[]): Promise<void> {
  for (const entry of entries) {
    await mkdir(entry.path, { recursive: true });

    if (entry.isRecursive) {
      const chowned = Bun.spawnSync([
        'chown',
        '-R',
        `${String(entry.uid)}:${String(entry.gid)}`,
        entry.path,
      ]);

      if (chowned.exitCode !== 0) {
        throw new Error(`could not set the owner of ${entry.path}: ${chowned.stderr.toString()}`);
      }
    } else {
      await chown(entry.path, entry.uid, entry.gid);
    }

    await chmod(entry.path, entry.mode);
  }
}
