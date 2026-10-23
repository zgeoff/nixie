import { join } from 'node:path';
import { dataFiles } from './data-files';
import type { DataFileSystem } from './data-storage';

export async function requireDataFiles(
  files: DataFileSystem,
  directory: string,
  name: string,
): Promise<void> {
  for (const file of dataFiles) {
    if (!(await files.probeFile(join(directory, file)))) {
      throw new Error(`${name} holds no ${file}`);
    }
  }
}
