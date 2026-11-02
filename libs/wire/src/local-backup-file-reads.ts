import { readdir } from 'node:fs/promises';
import type { FileDigest } from './read-file-sha256';
import { readFileSHA256 } from './read-file-sha256';

export interface BackupFileReads {
  readonly readDirectory: (path: string) => Promise<readonly string[]>;
  readonly probeFile: (path: string) => Promise<boolean>;
  readonly readText: (path: string) => Promise<string>;
  readonly readFileSHA256: (path: string) => Promise<FileDigest>;
}

export const localBackupFileReads: BackupFileReads = {
  readDirectory: (path) => readdir(path),
  probeFile: (path) => Bun.file(path).exists(),
  readText: (path) => Bun.file(path).text(),
  readFileSHA256,
};
