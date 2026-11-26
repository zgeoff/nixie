import type { Log, LogRecord, RecordInput } from '@heynixie/log';
import { writeRecordsInTransaction } from '@heynixie/log';
import type { EffectOverride, McpOverrides } from '@heynixie/policy';
import type { Transaction } from 'kysely';
import invariant from 'tiny-invariant';
import { withdrawRuleProposal } from '../proposed-rule/withdraw-rule-proposal';
import type { RuleStoreWrite, WrittenRules } from '../rule/write-rule-store';
import { writeRuleStore } from '../rule/write-rule-store';
import { buildSkillChanges } from '../skill/build-skill-changes';
import { writeSkillRows } from '../skill/write-skill-rows';
import type {
  DefinitionBudget,
  DefinitionsInForce,
  DefinitionsSnapshot,
  DefinitionsTables,
  RepoTask,
  SkillRef,
  SkillVersion,
  SourceKind,
} from '../types';
import type { BudgetSeedPlan } from '../utils/build-budget-seed-plan';
import type { SkillOverlay } from '../utils/build-skill-overlay';
import { toMcpOverridesForm } from '../utils/to-mcp-overrides-form';
import { writeBudgetsInForce } from '../utils/write-budgets-in-force';

interface BudgetStoreWrite {
  readonly plan: BudgetSeedPlan;

  // the budgets that the repo holds
  readonly repo: readonly DefinitionBudget[];
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
  readonly effects: ReadonlyMap<string, EffectOverride>;
  readonly mcp: McpOverrides;
  readonly unapplied: readonly string[];
  readonly skipped: readonly string[];
  readonly versions: readonly SkillVersion[];
  readonly overlay: SkillOverlay;
  readonly rules: RuleStoreWrite;
  readonly budgets: BudgetStoreWrite;

  // each pending rule change proposal, which the seed withdraws because it applies every widening
  // of the repo itself
  readonly withdrawnProposalIDs: readonly string[];

  readonly built: DefinitionsSnapshot;

  // the task definitions that the repo holds, before any runtime change
  readonly repoTasks: readonly RepoTask[];

  // the settles and moves of runtime task changes, written after the seed record
  readonly taskRecords: readonly RecordInput[];

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

  const definitions = {
    snapshotHash: plan.built.snapshotHash,
    personaVersion: plan.built.personaVersion,
  };

  for (const proposalID of plan.withdrawnProposalIDs) {
    await withdrawRuleProposal(
      tx,
      { log, clock: log.writer.clock, definitions: () => definitions },
      proposalID,
    );
  }

  const record = await writeSeedRecord(tx, log, plan, rules);

  await writeBudgetsInForce(
    tx,
    plan.budgets.plan.applied.map((edit) => ({ budgetID: edit.budgetID, after: edit.after })),
    record.sequence,
  );

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
    tasks: plan.built.tasks,
    voice: plan.built.voice,
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
        effects: Object.fromEntries(
          [...plan.effects].map(([tool, override]) => [
            tool,
            { add: [...override.add], remove: [...override.remove] },
          ]),
        ),
        mcp: toMcpOverridesForm(plan.mcp),
        repoTasks: plan.repoTasks.map((task) => ({ id: task.id, hash: task.hash })),
        repoBudgets: plan.budgets.repo.map((budget) => ({ ...budget })),
        unapplied: [...plan.unapplied],
        skipped: [...plan.skipped],
        rules: {
          revisions: rules.revisions.map((revision) => ({ ...revision })),
          applied: plan.rules.plan.applied.map((edit) => ({
            ruleID: edit.ruleID,
            change: edit.change,
          })),
          adopted: plan.rules.plan.adopted.map((change) => ({
            ruleID: change.ruleID,
            changeID: change.changeID,
          })),
          conflicts: plan.rules.plan.overlaid.flatMap((overlaid) =>
            (overlaid.beneath?.hash ?? null) === (overlaid.change.base?.hash ?? null)
              ? []
              : [overlaid.change.ruleID],
          ),
        },
      },
    },
    ...plan.taskRecords,
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
      source_repository: inForce.sourceRepository,
      revision: inForce.revision,
      content_hash: inForce.contentHash,
      format_version: inForce.formatVersion,
      snapshot_hash: inForce.snapshotHash,
      record_sequence: inForce.recordSequence,
    })
    .execute();
}
