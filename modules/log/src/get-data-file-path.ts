import { join } from 'node:path';
import type { DataFile } from './data-files';

export function getDataFilePath(directory: string, file: DataFile): string {
  return join(directory, file);
}
