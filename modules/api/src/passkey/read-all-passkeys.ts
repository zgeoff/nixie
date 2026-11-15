import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { APITables } from '../types';

export function readAllPasskeys(db: Kysely<unknown>) {
  return db
    .$extendTables<APITables>()
    .selectFrom('passkeys')
    .selectAll()
    .orderBy('registered_at')
    .orderBy(sql`rowid`)
    .execute();
}
