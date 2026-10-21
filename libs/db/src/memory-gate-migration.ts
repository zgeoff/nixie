import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Migration } from './types';

export const memoryGateMigration: Migration = {
  name: 'create the memory gate tables',
  up: async (tx) => {
    await sql`alter table memory_versions add column model text`.execute(tx);

    await createProposalTable(tx);
    await createNoticeEntryTable(tx);
    await createForgottenEvidenceTable(tx);
  },
};

async function createProposalTable(tx: Transaction<unknown>): Promise<void> {
  await sql`create table memory_proposals (
    proposal_id text primary key,
    item_id text not null,
    is_new_item integer not null check (is_new_item in (0, 1)),
    operation text not null check (operation in ('remember', 'retire')),
    target_version integer check (target_version is null or target_version >= 1),
    is_pinned integer not null check (is_pinned in (0, 1)),
    review_reason text not null,
    status text not null check (status in ('pending', 'consumed', 'rejected', 'lapsed')),
    action_hash text not null,
    sealed text not null,
    evidence text check (evidence is null or json_valid(evidence)),
    origin text not null check (origin in ('owner', 'conversation', 'task', 'memory_writer')),
    source text not null check (source in ('owner', 'owner_data', 'untrusted')),
    task_id text,
    thread text,
    cap_group text not null,
    checks text check (checks is null or json_valid(checks)),
    model text,
    notice_key text,
    created_sequence integer not null references records (sequence),
    created_at integer not null,
    lapse_at integer not null,
    resolved_sequence integer references records (sequence)
  ) strict`.execute(tx);

  await sql`create index memory_proposals_by_status on memory_proposals (status, lapse_at)`.execute(
    tx,
  );

  await sql`create index memory_proposals_by_cap_group on memory_proposals (cap_group)`.execute(tx);
}

async function createNoticeEntryTable(tx: Transaction<unknown>): Promise<void> {
  await sql`create table memory_notice_entries (
    entry_key text primary key,
    notice_key text not null,
    thread text,
    item_id text not null,
    version integer check (version is null or version >= 1),
    change text not null check (
      change in ('created', 'edited', 'retired', 'restored', 'undone', 'proposed')
    ),
    proposal_id text,
    sequence integer not null references records (sequence),
    recorded_at integer not null
  ) strict`.execute(tx);

  await sql`create index memory_notice_entries_by_thread on memory_notice_entries (
    thread, notice_key, sequence
  )`.execute(tx);
}

async function createForgottenEvidenceTable(tx: Transaction<unknown>): Promise<void> {
  await sql`create table memory_forgotten_evidence (
    evidence_key text primary key,
    record_sequence integer not null,
    item_id text not null
  ) strict`.execute(tx);

  await sql`create index memory_forgotten_evidence_by_record on memory_forgotten_evidence (
    record_sequence
  )`.execute(tx);
}
