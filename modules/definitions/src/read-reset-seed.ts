import type { JSONObject } from '@heynixie/log';
import type { Kysely } from 'kysely';
import invariant from 'tiny-invariant';
import { loadSkillVersions } from './load-skill-versions';
import type { SnapshotSkill } from './load-snapshot-skills';
import { loadSnapshotSkills } from './load-snapshot-skills';
import { readDefinitionsInForce } from './read-definitions-in-force';
import type { DefinitionsInForce, DefinitionsTables, SkillVersion, WrittenSkillRow } from './types';

// What a reset carries into the new log of the definitions in force: the seed, the snapshot row
// it points at, and the payload of the record that seeded it.
export interface ResetSeed {
  readonly inForce: DefinitionsInForce;
  readonly policyHash: string;
  readonly form: string;
  readonly label: string;
  readonly createdAt: number;
  readonly payload: JSONObject;

  // the skills the snapshot holds, with their files
  readonly skills: readonly SnapshotSkill[];

  // the skills nixie wrote that are in force, with each one's version and the version of your
  // definitions beneath it, which a retirement puts back in force
  readonly written: readonly WrittenSkillRow[];
  readonly beneath: readonly SkillVersion[];
}

type SeedRecordTables = Readonly<{
  records: { readonly sequence: number; readonly payload: string };
}>;

// Reads the definitions in force with everything a reset needs to seed them again, or null before
// the first seed.
export async function readResetSeed(db: Kysely<unknown>): Promise<ResetSeed | null> {
  const inForce = await readDefinitionsInForce(db);

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

  const written = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('written_skills')
    .selectAll()
    .where('state', '=', 'in_force')
    .orderBy('name')
    .execute();

  // a written skill whose seed has not run yet holds a version that no snapshot holds
  const beneath = await loadSkillVersions(
    db,
    written.flatMap((row) =>
      row.definitions_hash === null ? [row.skill_hash] : [row.skill_hash, row.definitions_hash],
    ),
  );

  return {
    inForce,
    policyHash: snapshot.policy_hash,
    form: snapshot.form,
    label: snapshot.label,
    createdAt: snapshot.created_at,

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the log wrote a JSON object
    payload: JSON.parse(record.payload) as JSONObject,
    skills: await loadSnapshotSkills(db, inForce.snapshotHash),
    written,
    beneath: [...beneath.values()],
  };
}
