import { dirname } from 'node:path';
import type { DataStorage } from '@heynixie/log';

export const removedSetSuffix = '.removed';

// A stop part way through a recursive removal can leave a set's marker without its copies, and the
// job would then ship it again, so the set gives up its name in one rename first. A repeat after a
// failure past the rename finishes the removal of the renamed folder.
export async function removeRecordedSet(
  files: DataStorage['files'],
  directory: string,
): Promise<void> {
  const removed = `${directory}${removedSetSuffix}`;

  await files.renameFile(directory, removed).catch((error: unknown) => {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) {
      throw error;
    }
  });

  await files.writeDirectoryToDisk(dirname(directory));
  await files.removeFile(removed);
}
