import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import { buildNameCheck } from './build-name-check';
import { toChunks } from './to-chunks';

// A kept record may point at a removed record through its parent or through a payload field that
// holds a sequence (an evidence list, a read cursor, a summary range, a moment quote). Removing the
// target would leave it dangling, so the migration stops and leaves the data as it was.
export async function requireNoOrphans(
  tx: Transaction<unknown>,
  removed: ReadonlySet<number>,
): Promise<void> {
  const schema = z.object({ sequence: z.number(), field: z.string() });

  for (const chunk of toChunks([...removed])) {
    const parents = await readQueryRows(
      sql`select sequence, 'parent' as field from records where parent in (${sql.join(chunk)})`,
      tx,
      schema,
    );

    const references = await readQueryRows(
      sql`select records.sequence as sequence, tree.fullkey as field
        from records, json_tree(records.payload) as tree
        where tree.type = 'integer'
          and ${buildNameCheck(sql.ref('tree.fullkey'))}
          and tree.atom in (${sql.join(chunk)})`,
      tx,
      schema,
    );

    const orphan = [...parents, ...references].find((row) => !removed.has(row.sequence));

    if (orphan !== undefined) {
      throw new Error(
        `record ${String(orphan.sequence)} refers to a record of a built-in memory task through ${orphan.field}, which the memory task migration cannot remove`,
      );
    }
  }
}
