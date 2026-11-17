import { createHash } from 'node:crypto';
import type { Writer } from '@heynixie/log';
import { withWriteTransaction } from '@heynixie/log';
import { toCanonicalJSON } from '@heynixie/triggers';
import { sql } from 'kysely';
import { z } from 'zod';

// Puts a seeded task definition back in the state of the release before reminders: its form names
// target: task, and every row that holds its hash holds the hash of that form. Returns the old hash.
export async function seedOldTaskHash(writer: Writer, definitionID: string): Promise<string> {
  const rows = await sql`select definition_hash, form from task_definition_versions
    where definition_id = ${definitionID}`.execute(writer.db);

  const row = z.object({ definition_hash: z.string(), form: z.string() }).parse(rows.rows[0]);
  const form = { ...z.record(z.string(), z.json()).parse(JSON.parse(row.form)), target: 'task' };

  const hash = createHash('sha256')
    .update(toCanonicalJSON({ id: definitionID, form, instructions: null, step: null }))
    .digest('hex');

  await withWriteTransaction(writer, async (tx) => {
    await sql`insert into task_definition_versions (definition_hash, definition_id, form, files)
      values (${hash}, ${definitionID}, ${toCanonicalJSON(form)}, '{}')`.execute(tx);

    await sql`update trigger_definitions set definition_hash = ${hash}
      where definition_hash = ${row.definition_hash}`.execute(tx);

    await sql`update tasks set definition_hash = ${hash}
      where definition_hash = ${row.definition_hash}`.execute(tx);

    await sql`delete from task_definition_versions
      where definition_hash = ${row.definition_hash}`.execute(tx);
  });

  return hash;
}
