import { sql } from 'kysely';
import type { Migration } from './types';

export const taskControlsMigration: Migration = {
  name: 'record a pause asked of a running task, the state a resume returns to, and each timer a stop withdrew',
  up: async (tx) => {
    const pauseRequested = await sql`
      select name from pragma_table_info('tasks') where name = 'pause_requested'`.execute(tx);

    if (pauseRequested.rows.length === 0) {
      await sql`alter table tasks add column pause_requested integer not null default 0
        check (pause_requested in (0, 1))`.execute(tx);
    }

    const resumeState = await sql`
      select name from pragma_table_info('tasks') where name = 'resume_state'`.execute(tx);

    if (resumeState.rows.length === 0) {
      await sql`alter table tasks add column resume_state text
        check (resume_state in ('ready', 'waiting'))`.execute(tx);
    }

    const withdrawnSequence = await sql`
      select name from pragma_table_info('timers') where name = 'withdrawn_sequence'`.execute(tx);

    if (withdrawnSequence.rows.length === 0) {
      await sql`alter table timers add column withdrawn_sequence integer
        references records (sequence)`.execute(tx);
    }
  },
};
