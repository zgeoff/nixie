import { Kysely } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import type { DatabaseOptions } from './types';

// Puts the SQLite database at path into service through nixie's dialect. Kysely starts the worker
// on the first query, and destroy() closes the database and stops the worker. A module narrows the
// handle to its own tables with withTables().
export function startDatabase(path: string, options: DatabaseOptions = {}): Kysely<unknown> {
  return new Kysely<unknown>({ dialect: buildSqliteWorkerDialect(path, options) });
}
