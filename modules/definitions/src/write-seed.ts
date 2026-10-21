import type { Log, LogRecord } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { buildSkillChanges } from './build-skill-changes';
import type { SkillOverlay } from './build-skill-overlay';
import type {
  DefinitionsInForce,
  DefinitionsSnapshot,
  DefinitionsTables,
  SkillRef,
  SkillVersion,
  SourceKind,
} from './types';
import { writeSkillRows } from './write-skill-rows';

export interface SeedPlan {
  readonly source: {
    readonly id: string;
    readonly kind: SourceKind;
    readonly revision: string;
    readonly contentHash: string;
  };
  readonly formatVersion: number;
  readonly unapplied: readonly string[];
  readonly skipped: readonly string[];
  readonly versions: readonly SkillVersion[];
  readonly overlay: SkillOverlay;
  readonly built: DefinitionsSnapshot;

  readonly previous: DefinitionsInForce | null;
}

export async function writeSeed(
  tx: Transaction<unknown>,
  log: Log,
  plan: SeedPlan,
): Promise<{ readonly inForce: DefinitionsInForce; readonly record: LogRecord }> {
  const seededAt = log.writer.clock.now();

  await writeSnapshotRows(tx, plan, seededAt);

  await writeSkillRows(tx, {
    snapshotHash: plan.built.snapshotHash,
    versions: plan.versions,
    skills: plan.overlay.skills,
    conversationSkills: plan.overlay.conversationSkills,
  });

  await writeBeneathRows(tx, plan.overlay, seededAt);

  const record = await writeSeedRecord(tx, log, plan);

  const inForce: DefinitionsInForce = {
    seededAt: new Date(seededAt),
    sourceID: plan.source.id,
    sourceKind: plan.source.kind,
    revision: plan.source.revision,
    contentHash: plan.source.contentHash,
    formatVersion: plan.formatVersion,
    snapshotHash: plan.built.snapshotHash,
    personaVersion: plan.built.personaVersion,
    persona: plan.built.persona,
    policyHash: plan.built.policyHash,
    recordSequence: record.sequence,
    skills: plan.overlay.skills.map((skill) => toSkillRef(skill)),
    conversationSkills: plan.overlay.conversationSkills,
  };

  await writeSeedRow(tx, inForce);

  return { inForce, record };
}

async function writeSnapshotRows(
  tx: Transaction<unknown>,
  plan: SeedPlan,
  seededAt: number,
): Promise<void> {
  const tables = tx.$extendTables<DefinitionsTables>();

  await tables
    .insertInto('personas')
    .values({ persona_version: plan.built.personaVersion, instructions: plan.built.persona })
    .onConflict((conflict) => conflict.doNothing())
    .execute();

  await tables
    .insertInto('definition_snapshots')
    .values({
      snapshot_hash: plan.built.snapshotHash,
      persona_version: plan.built.personaVersion,
      policy_hash: plan.built.policyHash,
      form: plan.built.form,
      label: plan.source.revision,
      created_at: seededAt,
    })
    .onConflict((conflict) => conflict.doNothing())
    .execute();
}

async function writeBeneathRows(
  tx: Transaction<unknown>,
  overlay: SkillOverlay,
  seededAt: number,
): Promise<void> {
  for (const [approvalID, definitions] of overlay.beneath) {
    await tx
      .$extendTables<DefinitionsTables>()
      .updateTable('written_skills')
      .set({
        definitions_hash: definitions?.skillHash ?? null,
        definitions_origin: definitions?.origin ?? null,
        updated_at: seededAt,
      })
      .where('approval_id', '=', approvalID)
      .execute();
  }
}

async function writeSeedRecord(
  tx: Transaction<unknown>,
  log: Log,
  plan: SeedPlan,
): Promise<LogRecord> {
  const skills = plan.overlay.skills.map((skill) => toSkillRef(skill));
  const skillChanges = buildSkillChanges(plan.previous?.skills ?? [], skills);

  const [record] = await writeRecordsInTransaction(tx, log, [
    {
      kind: 'definitions_seeded',
      definitions: {
        snapshotHash: plan.built.snapshotHash,
        personaVersion: plan.built.personaVersion,
      },
      payload: {
        sourceID: plan.source.id,
        sourceKind: plan.source.kind,
        revision: plan.source.revision,
        contentHash: plan.source.contentHash,
        formatVersion: plan.formatVersion,
        policyHash: plan.built.policyHash,
        skills: skills.map((skill) => ({
          name: skill.name,
          skillHash: skill.skillHash,
          origin: skill.origin,
        })),
        skillChanges: { ...skillChanges },

        writtenSkills: plan.overlay.skills.flatMap((skill) =>
          skill.approvalID === null ? [] : [{ name: skill.name, approvalID: skill.approvalID }],
        ),
        adoptedSkills: plan.overlay.adopted.map((skill) => ({
          name: skill.name,
          approvalID: skill.approvalID,
        })),
        unapplied: [...plan.unapplied],
        skipped: [...plan.skipped],
      },
    },
  ]);

  invariant(record);

  return record;
}

function toSkillRef(skill: SkillRef): SkillRef {
  return { name: skill.name, skillHash: skill.skillHash, origin: skill.origin };
}

async function writeSeedRow(tx: Transaction<unknown>, inForce: DefinitionsInForce): Promise<void> {
  await tx
    .$extendTables<DefinitionsTables>()
    .insertInto('definition_seeds')
    .values({
      seeded_at: inForce.seededAt.getTime(),
      source_id: inForce.sourceID,
      source_kind: inForce.sourceKind,
      revision: inForce.revision,
      content_hash: inForce.contentHash,
      format_version: inForce.formatVersion,
      snapshot_hash: inForce.snapshotHash,
      record_sequence: inForce.recordSequence,
    })
    .execute();
}
