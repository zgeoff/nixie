import invariant from 'tiny-invariant';
import type { DataFileSystem } from '../utils/data-storage';
import { getRestoreMarkerPath } from './get-restore-marker-path';
import type { PendingRestore } from './pending-restore';
import { readRestoreState } from './read-restore-state';
import type { RestoreMarker } from './restore-marker';
import { restoreMoves } from './restore-moves';

// Each move reaches the disk before the restore goes on, so a crash never leaves the databases a
// state ahead of the marker.
export async function writeRestoreState(
  files: DataFileSystem,
  dataDir: string,
  next: RestoreMarker,
): Promise<void> {
  const current = await readRestoreState(files, dataDir);

  invariant(
    restoreMoves[current.state].includes(next.state),
    `a restore never moves from ${current.state} to ${next.state}`,
  );

  const marker = getRestoreMarkerPath(dataDir);

  if (next.state === 'none') {
    await files.removeFile(marker);
  } else if (next.state === 'replacing') {
    // A restore run again over holding truncates the payload, and only a sync of the file itself
    // keeps a power loss from bringing the payload back beside a half-moved pair.
    await files.writeFile(marker, '');
    await files.writeFileToDisk(marker);
  } else {
    await writeHoldingMarker(files, marker, next.pending);
  }

  await files.writeDirectoryToDisk(dataDir);
}

// The rename leaves the marker whole at every instant, so a kill never gives none.
async function writeHoldingMarker(
  files: DataFileSystem,
  marker: string,
  pending: PendingRestore,
): Promise<void> {
  const markerSuffix = '.writing';
  const temporary = `${marker}${markerSuffix}`;

  await files.writeFile(temporary, `${JSON.stringify(pending, null, 2)}\n`);
  await files.writeFileToDisk(temporary);
  await files.renameFile(temporary, marker);
}
