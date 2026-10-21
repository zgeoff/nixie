import { Kysely } from 'kysely';
import { buildSqliteWorkerDialect } from './build-sqlite-worker-dialect';
import type { DatabaseOptions } from './types';

export function startDatabase(path: string, options: DatabaseOptions = {}): Kysely<unknown> {
  return new Kysely<unknown>({ dialect: buildSqliteWorkerDialect(path, options) });
}
