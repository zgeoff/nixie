import type { DatabaseOptions } from '@heynixie/db';
import type { BackupFileReads } from '@heynixie/wire';
import type { Kysely } from 'kysely';
import type { ClaimFileLock } from './claim-file-lock';

export interface DataStorage {
  readonly startDatabase: (path: string, options: DatabaseOptions) => Kysely<unknown>;
  readonly writeDatabaseCopy: (db: Kysely<unknown>, path: string) => Promise<void>;
  readonly claimFileLock: ClaimFileLock;
  readonly files: DataFileSystem;
}

export interface DataFileSystem extends BackupFileReads {
  readonly createDirectories: (path: string) => Promise<void>;
  readonly createDirectory: (path: string) => Promise<boolean>;
  readonly copyFile: (from: string, to: string) => Promise<void>;
  readonly renameFile: (from: string, to: string) => Promise<void>;
  readonly removeFile: (path: string) => Promise<void>;
  readonly writeFile: (path: string, text: string) => Promise<void>;
  readonly writeFileToDisk: (path: string) => Promise<void>;
  readonly writeDirectoryToDisk: (path: string) => Promise<void>;
}
