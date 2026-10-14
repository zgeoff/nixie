import type { JSONObject } from '@heynixie/log';
import type { Kysely } from 'kysely';
import invariant from 'tiny-invariant';
import { findDefinitionsInForce } from './find-definitions-in-force';
import type { DefinitionsInForce, DefinitionsTables } from './types';

// What a reset carries into the new log of the definitions in force: the seed, the snapshot row
// it points at, and the payload of the record that seeded it.
export interface ResetSeed {
  readonly inForce: DefinitionsInForce;
  readonly policyHash: string;
  readonly form: string;
  readonly label: string;
  readonly createdAt: number;
  readonly payload: JSONObject;
}

// Reads the definitions in force with everything a reset needs to seed them again, or null before
// the first seed.
export async function findResetSeed(db: Kysely<unknown>): Promise<ResetSeed | null> {
  const inForce = await findDefinitionsInForce(db);

  if (inForce === null) {
    return null;
  }
  const snapshot = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('definition_snapshots')
    .select(['policy_hash', 'form', 'label', 'created_at'])
    .where('snapshot_hash', '=', inForce.snapshotHash)
    .executeTakeFirstOrThrow();
  const record = await db
    .$extendTables<SeedRecordTables>()
    .selectFrom('records')
    .select('payload')
    .where('sequence', '=', inForce.recordSequence)
    .executeTakeFirst();

  // the seed row's foreign key holds its record in place
  invariant(record);
  return {
    inForce,
    policyHash: snapshot.policy_hash,
    form: snapshot.form,
    label: snapshot.label,
    createdAt: snapshot.created_at,

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the log wrote a JSON object
    payload: JSON.parse(record.payload) as JSONObject,
  };
}

type SeedRecordTables = Readonly<{
  records: { readonly sequence: number; readonly payload: string };
}>;
