import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from './read-query-rows';
import { runMigrations } from './run-migrations';
import { startDatabase } from './start-database';
import type { BuildSchema } from './types';

// SQLite lets a text primary key hold null, but every table fills its key, so a primary key counts
// as not null.
interface BuiltColumn {
  readonly name: string;
  readonly type: string;
  readonly isNullable: boolean;
}

export interface BuiltTable {
  readonly name: string;
  readonly columns: readonly BuiltColumn[];
}

const columnRowSchema = z.object({
  tableName: z.string(),
  name: z.string(),
  type: z.string(),
  notNull: z.number(),
  pk: z.number(),
});

export async function readBuiltTables(schema: BuildSchema): Promise<BuiltTable[]> {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-built-tables-'));

  try {
    const db = startDatabase(join(directory, 'built-tables.db'));

    try {
      await runMigrations(db, { schema, copyDir: directory });

      const rows = await readQueryRows(
        sql`select m.name as "tableName", p.name, p.type, p."notnull" as "notNull", p.pk
          from sqlite_master m join pragma_table_info(m.name) p
          where m.type = 'table' and m.name not like 'sqlite_%' and m.name != 'schema_version'
          order by m.name, p.cid`,
        db,
        columnRowSchema,
      );

      return buildTables(rows);
    } finally {
      await db.destroy();
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function buildTables(rows: readonly z.output<typeof columnRowSchema>[]): BuiltTable[] {
  const tables = new Map<string, BuiltColumn[]>();

  for (const row of rows) {
    const columns = tables.get(row.tableName) ?? [];

    columns.push({
      name: row.name,
      type: row.type.toLowerCase(),
      isNullable: row.notNull === 0 && row.pk === 0,
    });

    tables.set(row.tableName, columns);
  }

  return [...tables].map(([name, columns]) => ({ name, columns }));
}
