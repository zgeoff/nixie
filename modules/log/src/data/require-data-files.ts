import { join } from 'node:path';
import type { DataFileSystem } from '../utils/data-storage';
import { dataFiles } from './data-files';

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
