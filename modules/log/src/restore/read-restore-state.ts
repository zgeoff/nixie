import type { DataFileSystem } from '../utils/data-storage';
import { getRestoreMarkerPath } from './get-restore-marker-path';
import type { PendingRestore } from './pending-restore';
import { pendingRestoreSchema } from './pending-restore';
import type { RestoreMarker } from './restore-marker';

// A marker that is empty or does not parse is a restore that stopped, so it reads replacing.
export async function readRestoreState(
  files: DataFileSystem,
  dataDir: string,
): Promise<RestoreMarker> {
  const text = await files.readText(getRestoreMarkerPath(dataDir)).catch((error: unknown) => {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  });

  if (text === null) {
    return { state: 'none' };
  }

  const pending = parsePendingRestore(text);

  return pending === null ? { state: 'replacing' } : { state: 'holding', pending };
}

function parsePendingRestore(text: string): PendingRestore | null {
  try {
    const parsed = pendingRestoreSchema.safeParse(JSON.parse(text));

    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
