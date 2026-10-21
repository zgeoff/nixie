import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from './read-query-rows';

// One table, index, trigger or view as SQLite records it, with the statement that created it.
const schemaObjectSchema = z.object({
  type: z.string(),
  name: z.string(),
  tableName: z.string(),
  sql: z.string().nullable(),
});

export type SchemaObject = z.output<typeof schemaObjectSchema>;

// Reads every object that the migrations built, in a fixed order, so two databases that the same
// migrations built give equal lists. The migration runner owns schema_version, so it stays out.
export function readSchemaObjects(db: Kysely<unknown>): Promise<SchemaObject[]> {
  return readQueryRows(
    sql`select type, name, tbl_name as "tableName", sql
      from sqlite_master where name != 'schema_version' order by type, name`,
    db,
    schemaObjectSchema,
  );
}
