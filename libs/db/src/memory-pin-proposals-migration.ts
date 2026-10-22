import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import { z } from 'zod';
import { readQueryRows } from './read-query-rows';
import type { Migration } from './types';

export const memoryPinProposalsMigration: Migration = {
  name: 'admit the pin operation in memory proposals',
  up: async (tx) => {
    const isAdmitted = await probePinAdmitted(tx);

    if (isAdmitted) {
      return;
    }

    await rebuildProposals(tx);
  },
};

async function probePinAdmitted(tx: Transaction<unknown>): Promise<boolean> {
  const [table] = await readQueryRows(
    sql`select sql from sqlite_master where type = 'table' and name = 'memory_proposals'`,
    tx,
    z.object({ sql: z.string() }),
  );

  return table?.sql.includes("'pin'") === true;
}

// SQLite cannot change a check constraint in place, so the operation check that admits pin needs
// the table built again.
async function rebuildProposals(tx: Transaction<unknown>): Promise<void> {
  await sql`create table memory_proposals_pin (
    proposal_id text primary key,
    item_id text not null,
    is_new_item integer not null check (is_new_item in (0, 1)),
    operation text not null check (operation in ('remember', 'retire', 'pin')),
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
    resolved_sequence integer references records (sequence),
    kind text not null default 'fact',
    subject text
  ) strict`.execute(tx);

  await sql`insert into memory_proposals_pin (proposal_id, item_id, is_new_item, operation,
    target_version, is_pinned, review_reason, status, action_hash, sealed, evidence, origin,
    source, task_id, thread, cap_group, checks, model, notice_key, created_sequence, created_at,
    lapse_at, resolved_sequence, kind, subject)
    select proposal_id, item_id, is_new_item, operation, target_version, is_pinned,
      review_reason, status, action_hash, sealed, evidence, origin, source, task_id, thread,
      cap_group, checks, model, notice_key, created_sequence, created_at, lapse_at,
      resolved_sequence, kind, subject
    from memory_proposals`.execute(tx);

  await sql`drop table memory_proposals`.execute(tx);
  await sql`alter table memory_proposals_pin rename to memory_proposals`.execute(tx);

  await sql`create index memory_proposals_by_status on memory_proposals (status, lapse_at)`.execute(
    tx,
  );

  await sql`create index memory_proposals_by_cap_group on memory_proposals (cap_group)`.execute(tx);
}
