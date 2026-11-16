import type { JSONObject } from '@heynixie/log';
import { parseJSONObject } from '@heynixie/log';
import type { Kysely } from 'kysely';
import invariant from 'tiny-invariant';
import { readDefinitionsInForce } from '../definition/read-definitions-in-force';
import type { RuleProposalState } from '../rule/read-rule-proposals';
import { readRuleProposals } from '../rule/read-rule-proposals';
import { loadSkillVersions } from '../skill/load-skill-versions';
import type { SnapshotSkill } from '../skill/load-snapshot-skills';
import { loadSnapshotSkills } from '../skill/load-snapshot-skills';
import type {
  DefinitionsInForce,
  DefinitionsTables,
  SkillVersion,
  SnapshotRuleRow,
  TaskVersionRow,
  WrittenSkillRow,
} from '../types';

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

  readonly rules: readonly SnapshotRuleRow[];
  readonly closedProposalHashes: readonly string[];

  readonly taskVersions: readonly TaskVersionRow[];
}

type SeedRecordTables = Readonly<{
  records: { readonly sequence: number; readonly payload: string };
}>;

export async function readResetSeed(db: Kysely<unknown>, now: number): Promise<ResetSeed | null> {
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

  const rules = await db
    .$extendTables<DefinitionsTables>()
    .selectFrom('snapshot_rules')
    .selectAll()
    .where('snapshot_hash', '=', inForce.snapshotHash)
    .orderBy('rule_id')
    .execute();

  const taskHashes = inForce.tasks.map((task) => task.hash);

  const taskVersions =
    taskHashes.length === 0
      ? []
      : await db
          .$extendTables<DefinitionsTables>()
          .selectFrom('task_definition_versions')
          .selectAll()
          .where('definition_hash', 'in', taskHashes)
          .orderBy('definition_hash')
          .execute();

  const proposals = await readRuleProposals(db);

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
    rules,
    closedProposalHashes: collectClosedProposalHashes(proposals, now),
    taskVersions,
  };
}

// The lapse sweep runs hourly, so a proposal past its lapse time may still have no outcome.
function collectClosedProposalHashes(
  proposals: readonly RuleProposalState[],
  now: number,
): string[] {
  return proposals.flatMap((state) =>
    state.outcome === 'rejected' ||
    state.outcome === 'lapsed' ||
    (state.outcome === null && state.lapseAt <= now)
      ? [state.proposal.proposalHash]
      : [],
  );
}
