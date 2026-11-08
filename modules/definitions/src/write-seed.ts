import type { Log, LogRecord, RecordInput } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import type { RuleProposal } from './build-rule-proposal';
import { buildSkillChanges } from './build-skill-changes';
import type { SkillOverlay } from './build-skill-overlay';
import { rulesChangeProposedCodec } from './rules-change-proposed-codec';
import { rulesChangeWithdrawnCodec } from './rules-change-withdrawn-codec';
import type {
  DefinitionsInForce,
  DefinitionsSnapshot,
  DefinitionsTables,
  SkillRef,
  SkillVersion,
  SourceKind,
} from './types';
import type { RuleStoreWrite, WrittenRules } from './write-rule-store';
import { writeRuleStore } from './write-rule-store';
import { writeSkillRows } from './write-skill-rows';

export interface RuleProposalChange {
  readonly withdrawn: string | null;
  readonly proposed: RuleProposal | null;
}

export interface SeedPlan {
  readonly source: {
    readonly id: string;
    readonly kind: SourceKind;
    readonly repository: string | null;
    readonly revision: string;
    readonly contentHash: string;
  };
  readonly formatVersion: number;
  readonly unapplied: readonly string[];
  readonly skipped: readonly string[];
  readonly versions: readonly SkillVersion[];
  readonly overlay: SkillOverlay;
  readonly rules: RuleStoreWrite;
  readonly proposals: RuleProposalChange;
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

  const rules = await writeRuleStore(tx, plan.rules);

  await writeSnapshotRules(tx, plan.built.snapshotHash, rules);

  const record = await writeSeedRecord(tx, log, plan, rules);

  const inForce: DefinitionsInForce = {
    seededAt: new Date(seededAt),
    sourceID: plan.source.id,
    sourceKind: plan.source.kind,
    sourceRepository: plan.source.repository,
    revision: plan.source.revision,
    contentHash: plan.source.contentHash,
    formatVersion: plan.formatVersion,
    snapshotHash: plan.built.snapshotHash,
    personaVersion: plan.built.personaVersion,
    persona: plan.built.persona,
    prompts: plan.built.prompts,
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

async function writeSnapshotRules(
  tx: Transaction<unknown>,
  snapshotHash: string,
  rules: WrittenRules,
): Promise<void> {
  if (rules.inForce.length === 0) {
    return;
  }

  await tx
    .$extendTables<DefinitionsTables>()
    .insertInto('snapshot_rules')
    .values(
      rules.inForce.map((rule) => ({
        snapshot_hash: snapshotHash,
        rule_id: rule.ruleID,
        revision: rule.revision,
        rule_hash: rule.rule.hash,
        change_id: rule.changeID,
      })),
    )
    .onConflict((conflict) => conflict.doNothing())
    .execute();
}

async function writeSeedRecord(
  tx: Transaction<unknown>,
  log: Log,
  plan: SeedPlan,
  rules: WrittenRules,
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
        sourceRepository: plan.source.repository,
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
        rules: {
          revisions: rules.revisions.map((revision) => ({ ...revision })),
          applied: plan.rules.plan.applied.map((edit) => ({
            ruleID: edit.ruleID,
            change: edit.change,
          })),
          held: plan.rules.plan.held.map((edit) => edit.ruleID),
          adopted: plan.rules.plan.adopted.map((change) => ({
            ruleID: change.ruleID,
            changeID: change.changeID,
          })),
          conflicts: plan.rules.plan.overlaid.flatMap((overlaid) =>
            (overlaid.beneath?.hash ?? null) === (overlaid.change.base?.hash ?? null)
              ? []
              : [overlaid.change.ruleID],
          ),
          proposalID: plan.proposals.proposed?.proposalID ?? null,
        },
      },
    },
    ...buildProposalRecords(plan),
  ]);

  invariant(record);

  return record;
}

function toSkillRef(skill: SkillRef): SkillRef {
  return { name: skill.name, skillHash: skill.skillHash, origin: skill.origin };
}

function buildProposalRecords(plan: SeedPlan): readonly RecordInput[] {
  const definitions = {
    snapshotHash: plan.built.snapshotHash,
    personaVersion: plan.built.personaVersion,
  };

  const withdrawn = plan.proposals.withdrawn;
  const proposed = plan.proposals.proposed;

  return [
    ...(withdrawn === null
      ? []
      : [
          {
            kind: rulesChangeWithdrawnCodec.kind,
            definitions,
            payload: rulesChangeWithdrawnCodec.encode({
              proposalID: withdrawn,
              replacedBy: proposed?.proposalID ?? null,
            }),
          },
        ]),
    ...(proposed === null
      ? []
      : [
          {
            kind: rulesChangeProposedCodec.kind,
            definitions,
            payload: rulesChangeProposedCodec.encode(proposed),
          },
        ]),
  ];
}

async function writeSeedRow(tx: Transaction<unknown>, inForce: DefinitionsInForce): Promise<void> {
  await tx
    .$extendTables<DefinitionsTables>()
    .insertInto('definition_seeds')
    .values({
      seeded_at: inForce.seededAt.getTime(),
      source_id: inForce.sourceID,
      source_kind: inForce.sourceKind,
      source_repository: inForce.sourceRepository,
      revision: inForce.revision,
      content_hash: inForce.contentHash,
      format_version: inForce.formatVersion,
      snapshot_hash: inForce.snapshotHash,
      record_sequence: inForce.recordSequence,
    })
    .execute();
}
