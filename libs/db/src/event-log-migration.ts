import { sql } from 'kysely';
import type { Migration } from './types';

// Creates the event log, the threads projection and the log of the projection rows each record
// changed. The records table holds the plaintext envelope, the plain part of the payload, and the
// erasable fields as ciphertext under a record key that lives in keys.db, never in this file.
export const eventLogMigration: Migration = {
  name: 'create the event log',
  up: async (tx) => {
    await sql`create table records (
      sequence integer primary key,
      recorded_at integer not null,
      kind text not null check (length(kind) > 0),
      thread text,
      step_key text unique,
      parent integer references records (sequence),
      content_source text check (content_source in ('owner', 'owner_data', 'untrusted')),
      decision text check (decision is null or json_valid(decision)),
      prompt_cause text check (prompt_cause in (
        'direct_request', 'repeat', 'outside_steering', 'always_ask', 'ask_rule', 'no_rule'
      )),
      snapshot_hash text not null check (length(snapshot_hash) > 0),
      persona_version text,
      job_version text,
      proposal_id text,
      approval_id text,
      action_hash text,
      payload text not null check (json_valid(payload)),
      key_id text unique,
      sealed blob,
      check ((key_id is null) = (sealed is null))
    ) strict`.execute(tx);
    await sql`create index records_by_thread on records (thread, sequence)`.execute(tx);

    // no code path updates or deletes a record, and these triggers refuse one that tries
    await sql`create trigger records_refuse_update before update on records
      begin select raise(abort, 'records are append-only'); end`.execute(tx);
    await sql`create trigger records_refuse_delete before delete on records
      begin select raise(abort, 'records are append-only'); end`.execute(tx);

    await sql`create table threads (
      thread text primary key,
      first_sequence integer not null references records (sequence),
      last_sequence integer not null references records (sequence),
      record_count integer not null,
      last_recorded_at integer not null
    ) strict`.execute(tx);

    // the row a projection held after each record, or null once the record removed it, so a
    // reader that catches up gets the rows as of each record and never the current ones
    await sql`create table projection_changes (
      sequence integer not null references records (sequence),
      projection text not null,
      row_key text not null,
      row text check (row is null or json_valid(row)),
      primary key (sequence, projection, row_key)
    ) strict`.execute(tx);
  },
};
