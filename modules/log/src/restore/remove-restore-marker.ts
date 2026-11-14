import invariant from 'tiny-invariant';
import type { DataFileSystem } from '../utils/data-storage';
import { localDataStorage } from '../writer/local-data-storage';
import { readRestoreState } from './read-restore-state';
import { writeRestoreState } from './write-restore-state';

// Removes the marker of a finished restore once the server has installed it. A marker that is
// already gone stays gone, so a start that stops after the removal can run this again.
export async function removeRestoreMarker(
  dataDir: string,
  files: DataFileSystem = localDataStorage.files,
): Promise<void> {
  const current = await readRestoreState(files, dataDir);

  if (current.state === 'none') {
    return;
  }

  invariant(current.state === 'holding', `the restore of ${dataDir} never finished`);

  await writeRestoreState(files, dataDir, { state: 'none' });
}
