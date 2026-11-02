import { dirname } from 'node:path';
import type { DataStorage } from '@heynixie/log';

export const removedSetSuffix = '.removed';

// A stop part way through a recursive removal can leave a set's marker without its receipt or its
// copies, and the job would then try to ship it again, so the set gives up its name in one rename
// before its files go.
export async function removeRecordedSet(
  files: DataStorage['files'],
  directory: string,
): Promise<void> {
  const removed = `${directory}${removedSetSuffix}`;

  await files.renameFile(directory, removed);
  await files.writeDirectoryToDisk(dirname(directory));
  await files.removeFile(removed);
}
