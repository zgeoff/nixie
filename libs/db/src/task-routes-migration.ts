import { sql } from 'kysely';
import type { Migration } from './types';

export const taskRoutesMigration: Migration = {
  name: 'record who started each task, in which step, and where each routed message went',
  up: async (tx) => {
    const startedBy = await sql`
      select name from pragma_table_info('tasks') where name = 'started_by'`.execute(tx);

    if (startedBy.rows.length === 0) {
      await sql`alter table tasks add column started_by text`.execute(tx);
    }

    const startStep = await sql`
      select name from pragma_table_info('tasks') where name = 'start_step'`.execute(tx);

    if (startStep.rows.length === 0) {
      await sql`alter table tasks add column start_step text`.execute(tx);
    }

    await sql`create table if not exists message_routes (
      message_sequence integer primary key references records (sequence),
      task_id text not null,
      routed_sequence integer not null references records (sequence)
    ) strict`.execute(tx);
  },
};
