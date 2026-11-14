import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import { buildNameCheck } from './build-name-check';
import { toChunks } from './to-chunks';

// The rows that remain once the 2 tasks' rows are gone. The recomputed threads are left out, because
// the migration rebuilds them after this check.
const unscannedTables = new Set(['records', 'record_attachments', 'projection_changes', 'threads']);

export async function requireNoProjectionOrphans(
  tx: Transaction<unknown>,
  removed: ReadonlySet<number>,
): Promise<void> {
  const columns = await readQueryRows(
    sql`select master.name as table_name, info.name as column_name
      from sqlite_master as master, pragma_table_info(master.name) as info
      where master.type = 'table'
        and master.name not like 'sqlite_%'
        and ${buildNameCheck(sql.ref('info.name'))}`,
    tx,
    z.object({ table_name: z.string(), column_name: z.string() }),
  );

  for (const chunk of toChunks([...removed])) {
    for (const column of columns.filter((entry) => !unscannedTables.has(entry.table_name))) {
      const rows = await readQueryRows(
        sql`select ${sql.ref(column.column_name)} as value from ${sql.table(column.table_name)}
          where ${sql.ref(column.column_name)} in (${sql.join(chunk)}) limit 1`,
        tx,
        z.object({ value: z.number() }),
      );

      if (rows.length > 0) {
        throw new Error(
          `a row of ${column.table_name} refers to a record of a built-in memory task through ${column.column_name}, which the memory task migration cannot remove`,
        );
      }
    }

    const changes = await readQueryRows(
      sql`select changes.sequence as sequence, changes.projection as projection, tree.fullkey as field
        from projection_changes as changes, json_tree(changes.row) as tree
        where changes.row is not null
          and tree.type = 'integer'
          and ${buildNameCheck(sql.ref('tree.fullkey'))}
          and tree.atom in (${sql.join(chunk)})
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
