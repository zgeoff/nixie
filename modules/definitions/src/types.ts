import type { CheckedTables } from '@heynixie/db';
import type { JSONObject } from '@heynixie/log';
import type {
  BudgetCounts,
  BudgetPeriod,
  EffectOverride,
  RuleFileEntry,
  RuleFileWarning,
  RuleForm,
} from '@heynixie/policy';
import type { PromptOverrides } from '@heynixie/prompts';
import type { Generated, Kysely, Transaction } from 'kysely';
import type { TaskDefinition, TaskDefinitionWarning } from './task/types';

export interface DefinitionsSource {
  readonly id: string;
  readonly kind: SourceKind;
  readonly probe: () => Promise<string>;
  readonly snapshot: () => Promise<Snapshot>;
}

export type SourceKind = 'bucket' | 'git' | 'path';

export interface Snapshot {
  readonly contentHash: string;
  readonly files: ReadonlyMap<string, Uint8Array>;

  readonly revision: string;
  readonly repository: string | null;

  readonly skipped: readonly string[];
}

export interface SizeLimits {
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
}

export type PolicyRule = JSONObject & { readonly id: string };

export type ToolDeclaration = JSONObject & {
  readonly name: string;
  readonly effects: readonly string[];
};

export interface SnapshotPolicy {
  readonly rules: readonly PolicyRule[];
  readonly tools: readonly ToolDeclaration[];

  // the IDs of the known contacts, never their details
  readonly contacts?: readonly string[];

  // the consent checker's definition: its prompt hash and the model profile of its role
  readonly consent?: JSONObject;
}

export interface DefinitionsSnapshot {
  readonly snapshotHash: string;
  readonly personaVersion: string;
  readonly policyHash: string;

  readonly persona: string;
  readonly prompts: PromptOverrides;
  readonly tasks: SnapshotTasks;

  readonly form: string;
}

export type DefinitionsSkillOrigin = 'definitions' | 'vendored';

export type SkillOrigin = DefinitionsSkillOrigin | 'nixie';

// A skill author controls allowedTools, so nixie shows it and never grants it.
export interface SkillFrontmatter {
  readonly name: string;
  readonly description: string;
  readonly license: string | null;
  readonly compatibility: string | null;
  readonly allowedTools: string | null;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface SkillVersion {
  readonly name: string;
  readonly skillHash: string;
  readonly frontmatter: SkillFrontmatter;
  readonly files: ReadonlyMap<string, string>;
}

export interface ParsedSkill extends SkillVersion {
  readonly origin: DefinitionsSkillOrigin;
}

export interface ParsedDefinitions {
  readonly formatVersion: number;
  readonly persona: string;

  readonly skills: readonly ParsedSkill[];

  readonly conversationSkills: readonly string[];
  readonly prompts: PromptOverrides;
  readonly rules: readonly RuleFileEntry[];
  readonly budgets: readonly DefinitionBudget[];
  readonly ruleWarnings: readonly RuleFileWarning[];
  readonly effects: ReadonlyMap<string, EffectOverride>;
  readonly tasks: readonly TaskDefinition[];
  readonly taskWarnings: readonly TaskDefinitionWarning[];
  readonly unapplied: readonly string[];
}

export type SnapshotTask =
  | { readonly id: string; readonly hash: string; readonly origin: 'definitions' }
  | {
      readonly id: string;
      readonly hash: string;
      readonly origin: 'nixie';
      readonly changeID: string;
    };

// A task definition as the repo holds it, with no runtime change laid over it
export interface RepoTask {
  readonly id: string;
  readonly hash: string;
}

export type SnapshotTasks = readonly SnapshotTask[];

export type { DefinitionVersion } from '@heynixie/tasks';

export interface SkillRef {
  readonly name: string;
  readonly skillHash: string;
  readonly origin: SkillOrigin;
}

export interface DefinitionsInForce {
  readonly seededAt: Date;
  readonly sourceID: string;
  readonly sourceKind: SourceKind;
  readonly sourceRepository: string | null;
  readonly revision: string;
  readonly contentHash: string;
  readonly formatVersion: number;
  readonly snapshotHash: string;
  readonly personaVersion: string;
  readonly persona: string;
  readonly prompts: PromptOverrides;

  readonly policyHash: string;
  readonly recordSequence: number;

  readonly skills: readonly SkillRef[];

  readonly conversationSkills: readonly string[];

  readonly tasks: SnapshotTasks;
}

export type RuleOrigin = 'definitions' | 'nixie';

export type RuleChanger = 'owner' | 'nixie';

export interface StoredRule {
  readonly hash: string;
  readonly rule: RuleForm;
}

// A budget as the definitions or the store hold it. The hash covers what the budget counts, its
// limit and its period.
export interface DefinitionBudget {
  readonly id: string;
  readonly counts: BudgetCounts;
  readonly limitMicros: number;
  readonly period: BudgetPeriod;
  readonly hash: string;
}

export interface DefinitionRule extends StoredRule {
  readonly path: string;
}

export interface RuntimeRule {
  readonly changeID: string;
  readonly ruleID: string;
  readonly rule: StoredRule | null;
  readonly base: StoredRule | null;
  readonly beneath: StoredRule | null;
  readonly changedBy: RuleChanger;
  readonly reason: string;
  readonly changedAt: number;
}

export interface RuleInForce {
  readonly ruleID: string;
  readonly revision: number;
  readonly rule: StoredRule;
  readonly origin: RuleOrigin;
  readonly changeID: string | null;
}

interface PersonaRow {
  readonly persona_version: string;
  readonly instructions: string;
}

interface SnapshotRow {
  readonly snapshot_hash: string;
  readonly persona_version: string;
  readonly policy_hash: string;
  readonly form: string;
  readonly label: string;
  readonly created_at: number;
}

interface SeedRow {
  readonly seed: Generated<number>;
  readonly seeded_at: number;
  readonly source_id: string;
  readonly source_kind: SourceKind;
  readonly source_repository: string | null;
  readonly revision: string;
  readonly content_hash: string;
  readonly format_version: number;
  readonly snapshot_hash: string;
  readonly record_sequence: number;
}

export interface TaskVersionRow {
  readonly definition_hash: string;
  readonly definition_id: string;
  readonly form: string;
  readonly files: string;
}

interface SkillVersionRow {
  readonly skill_hash: string;
  readonly name: string;
  readonly frontmatter: string;
  readonly files: string;
}

interface SnapshotSkillRow {
  readonly snapshot_hash: string;
  readonly name: string;
  readonly skill_hash: string;
  readonly origin: DefinitionsSkillOrigin;

  readonly in_conversation: number;

  readonly approval_id: string | null;
}

export interface WrittenSkillRow {
  readonly approval_id: string;
  readonly proposal_id: string;
  readonly name: string;
  readonly skill_hash: string;
  readonly state: RuntimeChangeState;
  readonly base_hash: string | null;
  readonly base_origin: DefinitionsSkillOrigin | null;
  readonly definitions_hash: string | null;
  readonly definitions_origin: DefinitionsSkillOrigin | null;
  readonly approved_at: number;
  readonly updated_at: number;
}

export type RuntimeChangeState = 'in_force' | 'adopted' | 'superseded' | 'retired';

export type DefinitionOperation = 'add' | 'change' | 'remove' | 'undo';

export type RuntimeTaskCause =
  | 'later_change'
  | 'seed'
  | 'one_shot_fired'
  | 'one_shot_skipped'
  | 'reminder_moved'
  | 'kept_repo';

export interface RuntimeTaskDefinitionRow {
  readonly change_id: string;
  readonly short_id: string;
  readonly definition_id: string;
  readonly operation: DefinitionOperation;
  readonly definition_hash: string | null;
  readonly previous_hash: string | null;
  readonly base_hash: string | null;
  readonly definitions_hash: string | null;
  readonly replaces: string | null;
  readonly undoes: string | null;
  readonly caller: 'conversation' | 'owner';
  readonly state: RuntimeChangeState;
  readonly state_cause: RuntimeTaskCause | null;
  readonly changed_sequence: number;
  readonly updated_sequence: number;
}

interface TaskDefinitionExportRow {
  readonly export_id: string;
  readonly branch: string;
  readonly state: Exclude<DefinitionsExportState, 'exporting'> | null;
  readonly pull_request_number: number | null;
  readonly pull_request_url: string | null;
  readonly attempt_started_sequence: number | null;
  readonly updated_sequence: number;
}

interface SkillExportRow {
  readonly approval_id: string;
  readonly state: Exclude<DefinitionsExportState, 'exporting'>;
  readonly base_hash: string | null;
  readonly pull_request_number: number;
  readonly pull_request_url: string;
  readonly updated_at: number;
}

interface PromptExportRow {
  readonly approval_id: string;
  readonly state: Exclude<DefinitionsExportState, 'exporting'>;
  readonly pull_request_number: number;
  readonly pull_request_url: string;
  readonly updated_at: number;
}

interface ExportAttemptRow {
  readonly approval_id: string;
  readonly started_at: number;
}

export type DefinitionsExportState = 'exporting' | 'opened' | 'closed';

export interface DefinitionsRepo {
  readonly readBaseRevision: () => Promise<string>;

  readonly readFile: (path: string, revision: string) => Promise<string | null>;

  readonly readFolder: (path: string, revision: string) => Promise<readonly string[]>;

  readonly readFileSizes: (revision: string) => Promise<ReadonlyMap<string, number>>;

  readonly writePullRequest: (
    change: DefinitionsChange,
    revision: string,
  ) => Promise<PullRequestRef>;

  readonly readOpenPullRequest: (branch: string) => Promise<PullRequestRef | null>;
  readonly closePullRequest: (pullRequestNumber: number) => Promise<void>;
}

export interface DefinitionsChange {
  readonly branch: string;
  readonly title: string;
  readonly message: string;
  readonly body: string;

  readonly files: ReadonlyMap<string, string | null>;
}

export interface DefinitionsChangeKind {
  readonly readDue: (db: Kysely<unknown>) => Promise<readonly DueDefinitionsExport[]>;

  readonly readClosing: (
    db: Kysely<unknown>,
    approvalID: string | null,
  ) => Promise<readonly ClosingDefinitionsExport[]>;

  readonly probeInForce: (db: Kysely<unknown>, approvalID: string) => Promise<boolean>;

  readonly probePullRequestHeld: (
    db: Kysely<unknown>,
    pullRequestNumber: number,
    approvalID: string,
  ) => Promise<boolean>;

  readonly writeState: (tx: Transaction<unknown>, move: DefinitionsExportMove) => Promise<void>;
}

export interface DueDefinitionsExport {
  readonly approvalID: string;
  readonly branch: string;
  readonly baseHash: string | null;

  readonly readSource: (db: Kysely<unknown>) => Promise<DefinitionsExportSource>;
}

export interface DefinitionsExportSource {
  // null when the repo already holds the change, so the export opens no pull request
  readonly readChange: (
    repo: DefinitionsRepo,
    revision: string,
  ) => Promise<DefinitionsChange | null>;
}

export interface ClosingDefinitionsExport {
  readonly approvalID: string;
  readonly branch: string;

  readonly recordedPullRequest: number | null;
  readonly isBranchRead: boolean;
}

export type DefinitionsExportMove =
  | { readonly approvalID: string; readonly to: 'exporting'; readonly at: number }
  | {
      readonly approvalID: string;
      readonly to: 'opened';
      readonly baseHash: string | null;
      readonly pullRequest: PullRequestRef;
      readonly at: number;
    }
  | {
      readonly approvalID: string;
      readonly to: 'closed';
      readonly pullRequest: PullRequestRef | null;
      readonly at: number;
    };

export interface SkillExportText {
  readonly title: string | null;
  readonly message: string | null;

  readonly agentName: string | null;
  readonly ownerName: string | null;
}

export interface PullRequestRef {
  readonly number: number;
  readonly url: string;
}

interface RuleVersionRow {
  readonly rule_hash: string;
  readonly rule: string;
}

interface RuleRow {
  readonly rule_id: string;
  readonly revision: number;
  readonly rule_hash: string | null;
  readonly origin: RuleOrigin;
  readonly created_at: number;
  readonly updated_at: number;
}

interface RuleRevisionRow {
  readonly rule_id: string;
  readonly revision: number;
  readonly rule_hash: string | null;
  readonly created_at: number;
}

interface BudgetInForceRow {
  readonly budget_id: string;
  readonly counts: string;
  readonly limit_micros: number;
  readonly period: string;
  readonly hash: string;
  readonly updated_sequence: number;
}

interface DefinitionRuleRow {
  readonly rule_id: string;
  readonly rule_hash: string;
  readonly path: string;
}

interface SeededRuleRow {
  readonly rule_id: string;
  readonly rule_hash: string;
}

export interface RuntimeRuleRow {
  readonly change_id: string;
  readonly rule_id: string;
  readonly rule_hash: string | null;
  readonly state: RuntimeChangeState;
  readonly base_hash: string | null;
  readonly definitions_hash: string | null;
  readonly changed_by: RuleChanger;
  readonly reason: string;
  readonly changed_at: number;
  readonly updated_at: number;
}

export interface SnapshotRuleRow {
  readonly snapshot_hash: string;
  readonly rule_id: string;
  readonly revision: number;
  readonly rule_hash: string;
  readonly change_id: string | null;
}

interface RuleExportRow {
  readonly export_id: string;
  readonly state: Exclude<DefinitionsExportState, 'exporting'> | null;
  readonly pull_request_number: number | null;
  readonly pull_request_url: string | null;
  readonly attempt_started_at: number | null;
  readonly updated_at: number;
}

interface RuleFireRow {
  readonly rule_id: string;
  readonly last_fired_at: number;
}

interface GapAnswerRow {
  readonly proposal_id: string;
  readonly group_hash: string;
  readonly answer: 'approved' | 'declined';
  readonly answered_at: number;
  readonly answered_sequence: number;
}

interface GapGroupRow {
  readonly group_hash: string;
  readonly quiet_until: number | null;
  readonly proposal_id: string | null;
  readonly checked_sequence: number | null;

  // when the release before lapsed the group's proposed rule, whose record carries no quiet time
  readonly lapsed_at: number | null;
}

// Kysely's table map needs an index signature, which an interface lacks, so the tables are mapped
// types.
export type DefinitionsTables = CheckedTables<
  Readonly<{
    personas: PersonaRow;
    definition_snapshots: SnapshotRow;
    definition_seeds: SeedRow;
    skill_versions: SkillVersionRow;
    snapshot_skills: SnapshotSkillRow;
    written_skills: WrittenSkillRow;
    skill_exports: SkillExportRow;
    skill_export_attempts: ExportAttemptRow;
    prompt_exports: PromptExportRow;
    prompt_export_attempts: ExportAttemptRow;
    rule_versions: RuleVersionRow;
    rules: RuleRow;
    rule_revisions: RuleRevisionRow;
    definition_rules: DefinitionRuleRow;
    seeded_rules: SeededRuleRow;
    runtime_rules: RuntimeRuleRow;
    snapshot_rules: SnapshotRuleRow;
    rule_fires: RuleFireRow;
    closed_rule_proposals: { readonly proposal_hash: string };
    budgets_in_force: BudgetInForceRow;
    rule_exports: RuleExportRow;
    gap_answers: GapAnswerRow;
    gap_groups: GapGroupRow;
    task_definition_versions: TaskVersionRow;
    runtime_task_definitions: RuntimeTaskDefinitionRow;
    task_definition_exports: TaskDefinitionExportRow;
  }>
>;
