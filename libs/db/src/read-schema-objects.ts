import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from './read-query-rows';

const schemaObjectSchema = z.object({
  type: z.string(),
  name: z.string(),
  tableName: z.string(),
  sql: z.string().nullable(),
});

export type SchemaObject = z.output<typeof schemaObjectSchema>;

export function readSchemaObjects(db: Kysely<unknown>): Promise<SchemaObject[]> {
  return readQueryRows(
    sql`select type, name, tbl_name as "tableName", sql
      from sqlite_master where name != 'schema_version' order by type, name`,
    db,
    schemaObjectSchema,
  );
}
