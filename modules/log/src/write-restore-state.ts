import invariant from 'tiny-invariant';
import type { DataFileSystem } from './data-storage';
import { getRestoreMarkerPath } from './get-restore-marker-path';
import { readRestoreState } from './read-restore-state';
import type { RestoreState } from './restore-moves';
import { restoreMoves } from './restore-moves';

const markerWrites: Readonly<
  Record<RestoreState, (files: DataFileSystem, marker: string) => Promise<void>>
> = {
  none: (files, marker) => files.removeFile(marker),
  replacing: (files, marker) => files.writeFile(marker, ''),
};

// Each move reaches the disk before the restore goes on, so a crash never leaves the databases a
// state ahead of the marker.
export async function writeRestoreState(
  files: DataFileSystem,
  dataDir: string,
  next: RestoreState,
): Promise<void> {
  const current = await readRestoreState(files, dataDir);

  invariant(
    restoreMoves[current].includes(next),
    `a restore never moves from ${current} to ${next}`,
  );

  await markerWrites[next](files, getRestoreMarkerPath(dataDir));
  await files.writeDirectoryToDisk(dataDir);
}
