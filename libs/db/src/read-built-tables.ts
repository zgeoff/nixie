import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { runMigrations } from './run-migrations';
import { startDatabase } from './start-database';
import type { BuildSchema } from './types';

// One column as the migrations declare it. A primary key counts as not null, because every table
// fills its key, even where SQLite would let a text key hold null.
interface BuiltColumn {
  readonly name: string;
  readonly type: string;
  readonly isNullable: boolean;
}

export interface BuiltTable {
  readonly name: string;
  readonly columns: readonly BuiltColumn[];
}

interface ColumnRow {
  readonly tableName: string;
  readonly name: string;
  readonly type: string;
  readonly notNull: number;
  readonly pk: number;
}

// Runs the schema's migrations on an empty database in a temporary directory and reads back each
// table with its columns, tables by name and columns in their declared order. The migration
// runner owns schema_version, so it stays out.
export async function readBuiltTables(schema: BuildSchema): Promise<BuiltTable[]> {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-built-tables-'));

  try {
    const db = startDatabase(join(dir, 'built-tables.db'));

    try {
      await runMigrations(db, { schema, copyDir: dir });

      const result = await sql<ColumnRow>`select m.name as "tableName", p.name, p.type,
          p."notnull" as "notNull", p.pk
        from sqlite_master m join pragma_table_info(m.name) p
        where m.type = 'table' and m.name not like 'sqlite_%' and m.name != 'schema_version'
        order by m.name, p.cid`.execute(db);

      return buildTables(result.rows);
    } finally {
      await db.destroy();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function buildTables(rows: readonly ColumnRow[]): BuiltTable[] {
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
