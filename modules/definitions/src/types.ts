import type { CheckedTables } from '@heynixie/db';
import type { JSONObject } from '@heynixie/log';
import type { Generated } from 'kysely';

// Where nixie reads your definitions from. probe returns a token that changes when the definitions
// change, so a poll takes a snapshot only on a new token.
export interface DefinitionsSource {
  readonly id: string;
  readonly kind: SourceKind;
  readonly probe: () => Promise<string>;
  readonly snapshot: () => Promise<Snapshot>;
}

export type SourceKind = 'bucket' | 'git' | 'path';

// The files of one revision. Every path is relative to the definitions root with '/' separators,
// and every file's CRLF line endings are already LF.
export interface Snapshot {
  // the same for the same files, whatever the source
  readonly contentHash: string;
  readonly files: ReadonlyMap<string, Uint8Array>;

  // the commit for git, the content hash for a path or a bucket
  readonly revision: string;

  // the paths the filter left out, in path order, for the seed's record
  readonly skipped: readonly string[];
}

// The byte limits past which a snapshot fails: per file, and over every file the filter keeps.
export interface SizeLimits {
  readonly maxFileBytes: number;
  readonly maxTotalBytes: number;
}

// A rule in its canonical form, which the policy module owns.
export type PolicyRule = JSONObject & { readonly id: string };

// A tool's effect declaration, which the policy module owns. effects is a set, so the snapshot
// form sorts it and drops duplicates.
export type ToolDeclaration = JSONObject & {
  readonly name: string;
  readonly effects: readonly string[];
};

// The policy in force, which the composition root passes in. In slice 1 it holds the fixed rule,
// the test rule in a test build, and every tool declaration in the registry.
export interface SnapshotPolicy {
  readonly rules: readonly PolicyRule[];
  readonly tools: readonly ToolDeclaration[];
}

// The definitions in force that a snapshot hash covers, in canonical form, with their hashes.
export interface DefinitionsSnapshot {
  readonly snapshotHash: string;
  readonly personaVersion: string;
  readonly policyHash: string;

  // the persona's normalised text, which personaVersion hashes
  readonly persona: string;

  // the canonical JSON that snapshotHash hashes
  readonly form: string;
}

// Where a skill in your definitions came from: your own files, or a vendored copy that
// skills.lock.json records.
export type DefinitionsSkillOrigin = 'definitions' | 'vendored';

// Where a skill in force came from: your definitions, or nixie, which wrote it and applied it on
// your approval.
export type SkillOrigin = DefinitionsSkillOrigin | 'nixie';

// The SKILL.md fields nixie reads. allowedTools is shown and never granted.
export interface SkillFrontmatter {
  readonly name: string;
  readonly description: string;
  readonly license: string | null;
  readonly compatibility: string | null;
  readonly allowedTools: string | null;
  readonly metadata: Readonly<Record<string, string>>;
}

// One version of a skill, which its content hash keys. files holds every file by its path inside
// the skill's folder, SKILL.md included, as text.
export interface SkillVersion {
  readonly name: string;
  readonly skillHash: string;
  readonly frontmatter: SkillFrontmatter;
  readonly files: ReadonlyMap<string, string>;
}

export interface ParsedSkill extends SkillVersion {
  readonly origin: DefinitionsSkillOrigin;
}

// What the seed reads from a snapshot. unapplied lists each file the seed left out, in path order,
// such as a rule file before slice 3 seeds rules.
export interface ParsedDefinitions {
  readonly formatVersion: number;
  readonly persona: string;

  // every skill that passed the seed checks, in name order; none before format 2
  readonly skills: readonly ParsedSkill[];

  // the skills field of nixie.yaml in name order, every skill when it is unset
  readonly conversationSkills: readonly string[];
  readonly unapplied: readonly string[];
}

// A skill in force: its name, the version it is at, and where it came from.
export interface SkillRef {
  readonly name: string;
  readonly skillHash: string;
  readonly origin: SkillOrigin;
}

// The newest seed: where its files came from, and the definitions it put in force.
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

  // the hash of the policy the snapshot holds, which a conversation session records at its opening
  readonly policyHash: string;
  readonly recordSequence: number;

  // the skills the snapshot holds, in name order
  readonly skills: readonly SkillRef[];

  // the names on the conversation's skill list, in name order
  readonly conversationSkills: readonly string[];
}

// The rows of the definitions tables, as SQLite returns them.
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

// frontmatter holds the SkillFrontmatter and files the files by path, each as JSON
interface SkillVersionRow {
  readonly skill_hash: string;
  readonly name: string;
  readonly frontmatter: string;
  readonly files: string;
}

// a skill that nixie wrote keeps the origin 'definitions' in its row, and the approval that
// applied it marks it
interface SnapshotSkillRow {
  readonly snapshot_hash: string;
  readonly name: string;
  readonly skill_hash: string;
  readonly origin: DefinitionsSkillOrigin;

  // 1 when the skill is on the conversation's skill list
  readonly in_conversation: number;

  // the approval that applied a skill nixie wrote, or null for a skill from your definitions
  readonly approval_id: string | null;
}

// a skill that nixie wrote, applied by an approval; the base is the version in your definitions
// when the approval applied it, and the definitions version is the one at the newest seed, each
// null when your definitions lack the skill
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

// Where a skill that nixie wrote stands: in force over your definitions, adopted once a seed
// brings the same version from your definitions, superseded by a later approved version, or
// retired when you keep your definitions' version instead.
export type WrittenSkillState = 'in_force' | 'adopted' | 'superseded' | 'retired';

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type DefinitionsTables = CheckedTables<
  Readonly<{
    personas: PersonaRow;
    definition_snapshots: SnapshotRow;
    definition_seeds: SeedRow;
    skill_versions: SkillVersionRow;
    snapshot_skills: SnapshotSkillRow;
    written_skills: WrittenSkillRow;
  }>
>;
