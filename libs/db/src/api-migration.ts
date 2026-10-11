import { sql } from 'kysely';
import type { Migration } from './types';

// Creates the identity record, the enrolment codes, the checked actions the API answered, and the
// refusals projection. The first 3 are not projections, because a call moves a session's last seen
// time without a record; each change an audit needs still writes a record in the same transaction.
export const apiMigration: Migration = {
  name: 'create the identity record, enrolment codes, client actions and refusals',
  up: async (tx) => {
    // one row per channel identity; a device session's external ID is its own identity ID, and its
    // row keeps the token hash after a revoke, so a revoked token resolves to its row and is refused
    await sql`create table identities (
      identity_id text primary key,
      channel text not null check (length(channel) > 0),
      external_id text not null check (length(external_id) > 0),
      label text not null,
      token_hash text unique,
      paired_at integer not null,
      last_seen_at integer not null,
      revoked_at integer,
      paired_sequence integer not null references records (sequence),
      unique (channel, external_id)
    ) strict`.execute(tx);

    // a code is kept only as its hash; issued_by is null for a code nixie printed on the host
    await sql`create table enrolment_codes (
      code_hash text primary key,
      issued_at integer not null,
      expires_at integer not null,
      issued_by text references identities (identity_id),
      used_at integer,
      identity_id text references identities (identity_id),
      check ((used_at is null) = (identity_id is null))
    ) strict`.execute(tx);

    // the first result of each checked action, which answers a retry with the same client action ID
    await sql`create table client_actions (
      client_action_id text primary key,
      procedure text not null,
      identity_id text references identities (identity_id),
      input_hash text,
      result text not null check (json_valid(result)),
      recorded_at integer not null
    ) strict`.execute(tx);

    await sql`create table refusals (
      refusal_key text primary key,
      refused_at integer not null,
      refused_sequence integer not null references records (sequence)
    ) strict`.execute(tx);
  },
};
