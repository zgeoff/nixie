import type { Kysely } from 'kysely';
import { sql } from 'kysely';

export interface NixiePauseRowSeed {
  readonly pausedSequence: number;
  readonly cause: 'owner' | 'spending';
}

export async function seedNixiePauseRow(
  db: Kysely<unknown>,
  input: Partial<NixiePauseRowSeed> = {},
): Promise<NixiePauseRowSeed> {
  const row: NixiePauseRowSeed = { pausedSequence: 1, cause: 'owner', ...input };

  // The db lib sits below every module, so it cannot call the module that writes the pause: its
  // storage tests seed the row as the schema shapes it.
  await sql`insert into nixie_pause (id, cause, paused_sequence)
    values (1, ${row.cause}, ${row.pausedSequence})`.execute(db);

  return row;
}
