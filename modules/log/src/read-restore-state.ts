import type { DataFileSystem } from './data-storage';
import { getRestoreMarkerPath } from './get-restore-marker-path';
import type { RestoreState } from './restore-moves';

export async function readRestoreState(
  files: DataFileSystem,
  dataDir: string,
): Promise<RestoreState> {
  const marked = await files.probeFile(getRestoreMarkerPath(dataDir));

  return marked ? 'replacing' : 'none';
}
