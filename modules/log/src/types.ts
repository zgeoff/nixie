import type { MigrationReport } from '@heynixie/db';
import type { Kysely } from 'kysely';

// The one process that writes the database, from start until stop.
export interface Writer {
  readonly db: Kysely<unknown>;
  readonly epoch: number;
  readonly migration: MigrationReport;
  readonly stop: () => Promise<void>;
}

// The exclusive flock on the data directory, held until release or until the process dies.
export interface WriterLock {
  readonly release: () => void;
}

// The part of statfs that tells a local filesystem from a network one.
export type ReadFilesystemType = (path: string) => { readonly type: number };
