import { sql } from 'kysely';
import type { Migration } from '../types';

export const passkeysMigration: Migration = {
  name: 'create the passkeys table',
  up: async (tx) => {
    await sql`create table if not exists passkeys (
      passkey_id text primary key,
      credential_id text not null unique,
      public_key blob not null,
      user_handle blob not null,
      rp_id text not null,
      origin text not null,
      sign_count integer not null,
      backup_eligible integer not null,
      backed_up integer not null,
      transports text not null check (json_valid(transports)),
      aaguid text not null,
      label text not null,
      registered_by text not null,
      authorized_by text not null,
      registered_at integer not null,
      last_used_at integer,
      revoked_at integer
    ) strict`.execute(tx);
  },
};
