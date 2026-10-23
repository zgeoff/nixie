import { join } from 'node:path';
import { dataFiles } from './data-files';

export async function requireDataFiles(directory: string, name: string): Promise<void> {
  for (const file of dataFiles) {
    if (!(await Bun.file(join(directory, file)).exists())) {
      throw new Error(`${name} holds no ${file}`);
    }
  }
}
