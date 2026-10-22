import type { Transaction } from 'kysely';
import { sql } from 'kysely';
import type { Migration } from './types';

export const memoryUntilMigration: Migration = {
  name: 'add an end time to each memory version and item, and the lapse origin',
  up: async (tx) => {
    await rebuildVersions(tx);

    const columns = await sql`
      select name from pragma_table_info('memory_items') where name = 'until'`.execute(tx);

    if (columns.rows.length === 0) {
      await sql`alter table memory_items add column until integer`.execute(tx);
    }

    await sql`create index if not exists memory_items_by_until
      on memory_items (state, until)`.execute(tx);
  },
};

// SQLite cannot change a check constraint in place, so the origin check that admits lapse needs
// the table built again.
async function rebuildVersions(tx: Transaction<unknown>): Promise<void> {
  const columns = await sql`
    select name from pragma_table_info('memory_versions') where name = 'until'`.execute(tx);

  if (columns.rows.length > 0) {
    return;
  }

  await sql`create table memory_versions_until (
    version_key text primary key,
    item_id text not null references memory_items (item_id),
    version integer not null check (version >= 1),
    change text not null check (change in ('created', 'edited', 'retired', 'restored', 'undone')),
    state text not null check (state in ('active', 'retired')),
    sealed text not null,
    evidence text check (evidence is null or json_valid(evidence)),
    intent_evidence text check (intent_evidence is null or json_valid(intent_evidence)),
    origin text not null
      check (origin in ('owner', 'conversation', 'task', 'memory_writer', 'lapse')),
    source text not null check (source in ('owner', 'owner_data', 'untrusted')),
    task_id text,
    proposal_id text,
    checks text check (checks is null or json_valid(checks)),
    sequence integer not null references records (sequence),
    snapshot_hash text not null,
    recorded_at integer not null,
    model text,
    until integer,
    unique (item_id, version)
  ) strict`.execute(tx);

  await sql`insert into memory_versions_until (version_key, item_id, version, change, state,
    sealed, evidence, intent_evidence, origin, source, task_id, proposal_id, checks, sequence,
    snapshot_hash, recorded_at, model)
    select version_key, item_id, version, change, state, sealed, evidence, intent_evidence,
      origin, source, task_id, proposal_id, checks, sequence, snapshot_hash, recorded_at, model
    from memory_versions`.execute(tx);

  await sql`drop table memory_versions`.execute(tx);
  await sql`alter table memory_versions_until rename to memory_versions`.execute(tx);
}
