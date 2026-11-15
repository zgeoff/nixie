import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { APITables } from '../types';

export function readLivePasskeys(db: Kysely<unknown>) {
  return db
    .$extendTables<APITables>()
    .selectFrom('passkeys')
    .selectAll()
    .where('revoked_at', 'is', null)
    .orderBy('registered_at')
    .orderBy(sql`rowid`)
    .execute();
}
