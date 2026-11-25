import { sql } from 'kysely';
import type { Migration } from '../types';

export const connectionsMigration: Migration = {
  name: 'create the tables that hold OAuth clients, connections and the key IDs minted before a row names them',
  up: async (tx) => {
    // The secret and the account sit under keys of their own in the key store, so a forget that
    // deletes the keys leaves nothing readable behind. The removal counter outlives the row's
    // values: a forgotten credential keeps its row and its counter.
    await sql`create table if not exists oauth_clients (
      oauth_client_id text primary key,
      connector_id text not null default 'google',
      key_id text not null,
      secret_sealed blob,
      removal_counter integer not null default 0,
      created_at integer not null,
      removed_at integer
    ) strict`.execute(tx);

    await sql`create table if not exists connections (
      connection_id text primary key,
      short_id text not null unique,
      connector_id text not null default 'google',
      oauth_client_id text not null,
      key_id text not null,
      account_sealed blob,
      token_key_id text,
      refresh_token_sealed blob,
      status text not null check (status in ('active', 'failing', 'needs_consent', 'forgotten')),
      status_reason text check (status_reason in ('unauthorised', 'service_error', 'no_answer')),
      status_since integer not null,
      last_success_at integer,
      failures integer not null default 0,
      retry_at integer,
      binding text not null default 'enabled' check (binding in ('enabled', 'removing', 'removed')),
      removal_counter integer not null default 0,
      created_at integer not null
    ) strict`.execute(tx);

    // A key is minted in the key store, which commits apart from this file. A mark here, written
    // before the key exists, lets a sweep find a key that no row ever named.
    await sql`create table if not exists key_marks (
      key_id text primary key,
      marked_at integer not null
    ) strict`.execute(tx);
  },
};
