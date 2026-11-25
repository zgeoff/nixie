import { sql } from 'kysely';
import { z } from 'zod';
import type { Migration } from '../types';

export const connectionConsentMigration: Migration = {
  name: 'add the OAuth client registration, the connection label and scopes, and the consent requests',
  up: async (tx) => {
    // An OAuth client has a short ID for the web client, the redirect URI it registered with, and
    // the Drive picker's two public values. The secret's keyed fingerprint lets the client show that
    // two registrations hold the same secret.
    await addColumn(tx, 'oauth_clients', 'short_id', 'text');
    await addColumn(tx, 'oauth_clients', 'origin', 'text');
    await addColumn(tx, 'oauth_clients', 'redirect_uri', 'text');
    await addColumn(tx, 'oauth_clients', 'picker_key', 'text');
    await addColumn(tx, 'oauth_clients', 'project_number', 'text');
    await addColumn(tx, 'oauth_clients', 'secret_fingerprint', 'text');

    await sql`create unique index if not exists oauth_clients_short_id on oauth_clients (short_id)`.execute(
      tx,
    );

    // A connection's label sits under its account key. A row with no label belongs to a consent
    // that has not finished, and no part of nixie reads it as a connection.
    await addColumn(tx, 'connections', 'label_sealed', 'blob');
    await addColumn(tx, 'connections', 'granted_scopes', "text not null default '[]'");
    await addColumn(tx, 'connections', 'missing_scopes', "text not null default '[]'");
    await addColumn(tx, 'connections', 'refresh_expires_at', 'integer');
    await addColumn(tx, 'connections', 'token_fingerprint', 'text');

    // One row for each consent that began and has not finished or lapsed. The state's hash is kept,
    // never the state, and the PKCE verifier sits under a key of its own.
    await sql`create table if not exists consent_requests (
      consent_id text primary key,
      state_hash text not null unique,
      device_session_id text not null,
      oauth_client_id text not null,
      connection_id text,
      key_id text not null,
      verifier_sealed blob not null,
      claimed_at integer,
      created_at integer not null,
      expires_at integer not null
    ) strict`.execute(tx);
  },
};

// SQLite has no `add column if not exists`, so a column is added only when the table lacks it.
async function addColumn(
  tx: Parameters<Migration['up']>[0],
  table: string,
  column: string,
  definition: string,
): Promise<void> {
  const found = await sql`select name from pragma_table_info(${table})`.execute(tx);

  const names = z.array(z.object({ name: z.string() })).parse(found.rows);

  if (names.some((row) => row.name === column)) {
    return;
  }

  await sql.raw(`alter table ${table} add column ${column} ${definition}`).execute(tx);
}
