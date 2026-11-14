import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import { buildJSONLeaves } from './build-json-leaves';
import { buildNameCheck } from './build-name-check';
import { toChunks } from './to-chunks';

const scannedColumns = ['payload', 'decision'];

// A kept record may point at a removed record through its parent, or through a payload or decision
// field that holds a sequence. Removing the target would leave it dangling, so the migration stops
// and leaves the data as it was.
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

    const references = [];

    for (const column of scannedColumns) {
      const leaves = buildJSONLeaves(sql.ref(`records.${column}`));

      const rows = await readQueryRows(
        sql`select records.sequence as sequence, ${leaves.name} as field
          from records, ${leaves.from}
          where ${buildNameCheck(leaves.name)}
            and ${leaves.value} in (${sql.join(chunk)})`,
        tx,
        schema,
      );

      references.push(...rows);
    }

    const orphan = [...parents, ...references].find((row) => !removed.has(row.sequence));

    if (orphan !== undefined) {
      throw new Error(
        `record ${String(orphan.sequence)} refers to a record of a built-in memory task through ${orphan.field}, which the memory task migration cannot remove`,
      );
    }
  }
}
