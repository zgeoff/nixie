import type { DatabaseOptions } from '@heynixie/db';
import type { Kysely } from 'kysely';
import type { ClaimFileLock } from './claim-file-lock';

export interface DataStorage {
  readonly startDatabase: (path: string, options: DatabaseOptions) => Kysely<unknown>;
  readonly writeDatabaseCopy: (db: Kysely<unknown>, path: string) => Promise<void>;
  readonly claimFileLock: ClaimFileLock;
  readonly files: DataFileSystem;
}

export interface DataFileSystem {
  readonly probeFile: (path: string) => Promise<boolean>;
  readonly createDirectories: (path: string) => Promise<void>;
  readonly readDirectory: (path: string) => Promise<readonly string[]>;
  readonly copyFile: (from: string, to: string) => Promise<void>;
  readonly renameFile: (from: string, to: string) => Promise<void>;
  readonly removeFile: (path: string) => Promise<void>;
  readonly writeFile: (path: string, text: string) => Promise<void>;
  readonly writeToDisk: (path: string) => Promise<void>;
}
