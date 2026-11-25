import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from '../read-query-rows';
import type { Migration } from '../types';

const columns = [
  // the attempts of an action that the provider refused, which each take the action the next key
  { name: 'refused_count', definition: 'integer not null default 0' },

  // 1 for an action that a runner queued on its task's thread, with no call of a model behind it
  { name: 'is_runner', definition: 'integer not null default 0' },
] as const;

export const actionRefusalsMigration: Migration = {
  name: 'count the refused attempts of each action and mark the actions that a runner queued',
  up: async (tx) => {
    for (const column of columns) {
      const present = await readQueryRows(
        sql`select name from pragma_table_info('actions') where name = ${column.name}`,
        tx,
        z.object({ name: z.string() }),
      );

      if (present.length === 0) {
        await sql`alter table actions add column ${sql.id(column.name)} ${sql.raw(column.definition)}`.execute(
          tx,
        );
      }
    }
  },
};
