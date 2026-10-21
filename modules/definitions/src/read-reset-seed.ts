import type { JSONObject } from '@heynixie/log';
import { parseJSONObject } from '@heynixie/log';
import type { Kysely } from 'kysely';
import invariant from 'tiny-invariant';
import { loadSkillVersions } from './load-skill-versions';
import type { SnapshotSkill } from './load-snapshot-skills';
import { loadSnapshotSkills } from './load-snapshot-skills';
import { readDefinitionsInForce } from './read-definitions-in-force';
import type { DefinitionsInForce, DefinitionsTables, SkillVersion, WrittenSkillRow } from './types';

export interface ResetSeed {
  readonly inForce: DefinitionsInForce;
  readonly policyHash: string;
  readonly form: string;
  readonly label: string;
  readonly createdAt: number;
  readonly payload: JSONObject;

  readonly skills: readonly SnapshotSkill[];

  readonly written: readonly WrittenSkillRow[];
  readonly beneath: readonly SkillVersion[];
}

type SeedRecordTables = Readonly<{
  records: { readonly sequence: number; readonly payload: string };
}>;

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

  invariant(record);

  const written = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('written_skills')
    .selectAll()
    .where('state', '=', 'in_force')
    .orderBy('name')
    .execute();

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
    payload: parseJSONObject(record.payload),
    skills: await loadSnapshotSkills(db, inForce.snapshotHash),
    written,
    beneath: [...beneath.values()],
  };
}
