import type { SQLQueryBindings } from 'bun:sqlite';
import type { Transaction } from 'kysely';

export interface DatabaseOptions {
  // Without secure_delete, SQLite leaves a deleted key in the file's free pages.
  readonly secureDelete?: boolean;

  readonly busyTimeoutMs?: number | undefined;
}

export type WorkerRequest =
  | {
      readonly id: number;
      readonly kind: 'open';
      readonly path: string;
      readonly options: DatabaseOptions;
    }
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

export interface Migration {
  readonly name: string;
  readonly up: (tx: Transaction<unknown>) => Promise<void>;
}

export interface BuildSchema {
  readonly migrations: readonly Migration[];
  readonly oldestReader: number;
}

export interface StoredSchema {
  readonly version: number;
  readonly oldestReader: number;
}
