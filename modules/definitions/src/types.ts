import type { CheckedTables } from '@heynixie/db';
import type { JSONObject } from '@heynixie/log';
import type { Generated } from 'kysely';

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
}

export interface DefinitionsSnapshot {
  readonly snapshotHash: string;
  readonly personaVersion: string;
  readonly policyHash: string;

  readonly persona: string;

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
  readonly unapplied: readonly string[];
}

export interface SkillRef {
  readonly name: string;
  readonly skillHash: string;
  readonly origin: SkillOrigin;
}

export interface DefinitionsInForce {
  readonly seededAt: Date;
  readonly sourceID: string;
  readonly sourceKind: SourceKind;
  readonly revision: string;
  readonly contentHash: string;
  readonly formatVersion: number;
  readonly snapshotHash: string;
  readonly personaVersion: string;
  readonly persona: string;

  readonly policyHash: string;
  readonly recordSequence: number;

  readonly skills: readonly SkillRef[];

  readonly conversationSkills: readonly string[];
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
  readonly revision: string;
  readonly content_hash: string;
  readonly format_version: number;
  readonly snapshot_hash: string;
  readonly record_sequence: number;
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
  readonly state: WrittenSkillState;
  readonly base_hash: string | null;
  readonly base_origin: DefinitionsSkillOrigin | null;
  readonly definitions_hash: string | null;
  readonly definitions_origin: DefinitionsSkillOrigin | null;
  readonly approved_at: number;
  readonly updated_at: number;
}

export type WrittenSkillState = 'in_force' | 'adopted' | 'superseded' | 'retired';

interface SkillExportRow {
  readonly approval_id: string;
  readonly state: Exclude<SkillExportState, 'exporting'>;
  readonly base_hash: string | null;
  readonly pull_request_number: number;
  readonly pull_request_url: string;
  readonly updated_at: number;
}

interface SkillExportAttemptRow {
  readonly approval_id: string;
  readonly started_at: number;
}

export type SkillExportState = 'exporting' | 'opened' | 'closed';

export interface DefinitionsRepo {
  readonly readBaseRevision: () => Promise<string>;

  readonly readFile: (path: string, revision: string) => Promise<string | null>;

  readonly readFolder: (path: string, revision: string) => Promise<readonly string[]>;

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
    skill_export_attempts: SkillExportAttemptRow;
  }>
>;
