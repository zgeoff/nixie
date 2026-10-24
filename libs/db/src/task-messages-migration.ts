import { sql } from 'kysely';
import type { Migration } from './types';

export const taskMessagesMigration: Migration = {
  name: 'create the task messages and the hop of each task step',
  up: async (tx) => {
    await sql`alter table tasks add column step_hop integer not null default 0`.execute(tx);

    await sql`create table if not exists task_messages (
      message_id text primary key,
      from_task text not null,
      to_task text not null,
      kind text not null check (kind in (
        'progress', 'question', 'request', 'report', 'reply', 'chat'
      )),
      reply_to text,
      is_waiting integer not null check (is_waiting in (0, 1)),
      sent_sequence integer not null references records (sequence)
    ) strict`.execute(tx);

    await sql`create index if not exists task_messages_waiting
      on task_messages (from_task, sent_sequence) where is_waiting = 1`.execute(tx);
  },
};
