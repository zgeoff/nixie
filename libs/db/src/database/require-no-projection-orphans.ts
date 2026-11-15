import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import { buildJSONLeaves } from './build-json-leaves';
import { buildNameCheck } from './build-name-check';
import { toChunks } from './to-chunks';

// The rows that remain once the 2 tasks' rows are gone. The recomputed threads are left out, because
// the migration rebuilds them after this check.
const unscannedTables = new Set(['records', 'record_attachments', 'projection_changes', 'threads']);

const columnSchema = z.object({
  table_name: z.string(),
  column_name: z.string(),
  column_type: z.string(),
});

export async function requireNoProjectionOrphans(
  tx: Transaction<unknown>,
  removed: ReadonlySet<number>,
): Promise<void> {
  const columns = await readQueryRows(
    sql`select master.name as table_name, info.name as column_name, info.type as column_type
      from sqlite_master as master, pragma_table_info(master.name) as info
      where master.type = 'table' and master.name not like 'sqlite_%'`,
    tx,
    columnSchema,
  );

  const scanned = columns.filter((column) => !unscannedTables.has(column.table_name));

  for (const chunk of toChunks([...removed])) {
    for (const column of scanned) {
      const field = await readColumnReference(tx, column, chunk);

      if (field !== null) {
        throw new Error(
          `a row of ${column.table_name} refers to a record of a built-in memory task through ${field}, which the memory task migration cannot remove`,
        );
      }
    }

    const leaves = buildJSONLeaves(sql.ref('changes.row'), { isNestedDecoded: true });

    const changes = await readQueryRows(
      sql`select changes.sequence as sequence, changes.projection as projection,
          ${leaves.name} as field
        from projection_changes as changes, ${leaves.from}
        where changes.row is not null
          and changes.projection != 'threads'
          and ${buildNameCheck(leaves.name)}
          and ${leaves.value} in (${sql.join(chunk)})
        limit 1`,
      tx,
      z.object({ sequence: z.number(), projection: z.string(), field: z.string() }),
    );

    const [change] = changes;

    if (change !== undefined) {
      throw new Error(
        `a change of ${change.projection} at record ${String(change.sequence)} refers to a record of a built-in memory task through ${change.field}, which the memory task migration cannot remove`,
      );
    }
  }
}

type Column = z.output<typeof columnSchema>;

// An integer column refers by its name. A text column can hold JSON, such as an evidence column,
// whose fields refer by their own names.
async function readColumnReference(
  tx: Transaction<unknown>,
  column: Column,
  chunk: readonly number[],
): Promise<string | null> {
  const table = sql.table(column.table_name);
  const ref = sql.ref(column.column_name);

  if (column.column_type.toLowerCase() === 'integer') {
    const rows = await readQueryRows(
      sql`select ${column.column_name} as field from ${table}
        where ${buildNameCheck(sql.lit(column.column_name))}
          and ${ref} in (${sql.join(chunk)}) limit 1`,
      tx,
      z.object({ field: z.string() }),
    );

    return rows[0]?.field ?? null;
  }

  if (column.column_type.toLowerCase() !== 'text') {
    return null;
  }

  const leaves = buildJSONLeaves(sql`${table}.${ref}`, { isNestedDecoded: false });

  const rows = await readQueryRows(
    sql`select ${column.column_name} || ${leaves.name} as field from ${table}, ${leaves.from}
      where ${buildNameCheck(sql`${column.column_name} || ${leaves.name}`)}
        and ${leaves.value} in (${sql.join(chunk)}) limit 1`,
    tx,
    z.object({ field: z.string() }),
  );

  return rows[0]?.field ?? null;
}
