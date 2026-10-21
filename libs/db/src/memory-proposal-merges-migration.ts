import { sql } from 'kysely';
import type { Migration } from './types';

export const memoryProposalMergesMigration: Migration = {
  name: 'create the memory proposal merges table',
  up: async (tx) => {
    await sql`create table memory_proposal_merges (
      merge_id text primary key,
      proposal_id text not null references memory_proposals (proposal_id),
      origin text not null check (origin in ('owner', 'conversation', 'task', 'memory_writer')),
      task_id text,
      thread text,
      model text,
      sequence integer not null references records (sequence),
      recorded_at integer not null
    ) strict`.execute(tx);

    await sql`create index memory_proposal_merges_by_proposal on memory_proposal_merges (
      proposal_id, sequence
    )`.execute(tx);
  },
};
