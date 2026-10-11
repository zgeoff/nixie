import type { Kysely } from 'kysely';
import { sql } from 'kysely';

// One table, index, trigger or view as SQLite records it, with the statement that created it.
export interface SchemaObject {
  readonly type: string;
  readonly name: string;
  readonly tableName: string;
  readonly sql: string | null;
}

// Reads every object that the migrations built, in a fixed order, so two databases that the same
// migrations built give equal lists. The migration runner owns schema_version, so it stays out.
export async function readSchemaObjects(db: Kysely<unknown>): Promise<SchemaObject[]> {
  const result = await sql<SchemaObject>`select type, name, tbl_name as "tableName", sql
    from sqlite_master where name != 'schema_version' order by type, name`.execute(db);

  return [...result.rows];
}
