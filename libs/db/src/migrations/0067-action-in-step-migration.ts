import { sql } from 'kysely';
import { z } from 'zod';
import type { Migration } from '../types';

// The column carries no CHECK constraint, so the release before still reads the table. An action
// queued before this release runs on the action runner, which the default of 0 says.
export const actionInStepMigration: Migration = {
  name: 'mark each action that a task step runs instead of the action runner',
  up: async (tx) => {
    const columns = await sql`select name from pragma_table_info('actions')`.execute(tx);

    const names = z
      .object({ name: z.string() })
      .array()
      .parse(columns.rows)
      .map((row) => row.name);

    if (!names.includes('runs_in_step')) {
      await sql`alter table actions add column runs_in_step integer not null default 0`.execute(tx);
    }
  },
};
