import { sql } from 'kysely';
import type { Migration } from './types';

export const promptApprovalsMigration: Migration = {
  name: 'create the approved prompt overrides and their export state',
  up: async (tx) => {
    await sql`create table if not exists prompt_approvals (
      approval_id text primary key,
      proposal_id text not null unique,
      prompt_id text not null,
      thread text,
      entry text not null,
      files text not null,
      state text not null check (state in ('current', 'superseded')),
      approved_at integer not null,
      updated_at integer not null
    ) strict`.execute(tx);

    await sql`create unique index if not exists prompt_approvals_current
      on prompt_approvals (prompt_id) where state = 'current'`.execute(tx);

    await sql`create table if not exists prompt_exports (
      approval_id text primary key references prompt_approvals (approval_id),
      state text not null check (state in ('opened', 'closed')),
      pull_request_number integer not null,
      pull_request_url text not null,
      updated_at integer not null
    ) strict`.execute(tx);

    await sql`create table if not exists prompt_export_attempts (
      approval_id text primary key references prompt_approvals (approval_id),
      started_at integer not null
    ) strict`.execute(tx);
  },
};
