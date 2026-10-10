import type { SQLQueryBindings } from 'bun:sqlite';
import type { Transaction } from 'kysely';

// The messages between the dialect on the main thread and the SQLite worker. Each request carries an
// id, and the worker answers it with a response under the same id.
export type WorkerRequest =
  | { readonly id: number; readonly kind: 'open'; readonly path: string }
  | {
      readonly id: number;
      readonly kind: 'query';
      readonly sql: string;
      readonly parameters: readonly SQLQueryBindings[];
    }
  | { readonly id: number; readonly kind: 'close' };

export interface WorkerQueryResult {
  readonly rows: readonly unknown[];
  readonly changes?: number;
  readonly lastInsertRowid?: number | bigint;
}

export interface WorkerError {
  readonly message: string;
  readonly code: string | undefined;
}

export type WorkerResponse =
  | { readonly id: number; readonly ok: true; readonly result: WorkerQueryResult }
  | { readonly id: number; readonly ok: false; readonly error: WorkerError };

// One step of the schema. A migration runs in its own transaction, together with the update of the
// schema version, so a failed migration leaves the schema at the version before it.
export interface Migration {
  readonly name: string;
  readonly up: (tx: Transaction<unknown>) => Promise<void>;
}

// What a build knows about its schema. It writes schema version migrations.length, and oldestReader
// is the oldest schema version whose build can still read and write what this build leaves. A
// release that keeps the schema readable by the release before leaves oldestReader where it was.
export interface BuildSchema {
  readonly migrations: readonly Migration[];
  readonly oldestReader: number;
}

// What the database records about its schema: the version it holds, and the oldest schema version
// whose build can read it, both written by the build that migrated it last.
export interface StoredSchema {
  readonly version: number;
  readonly oldestReader: number;
}
