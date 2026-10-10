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

// What the seed reads from a snapshot. unapplied lists each file the seed left out, in path order,
// such as a rule file before slice 3 seeds rules.
export interface ParsedDefinitions {
  readonly formatVersion: number;
  readonly persona: string;
  readonly unapplied: readonly string[];
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
  readonly recordSequence: number;
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

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type DefinitionsTables = Readonly<{
  personas: PersonaRow;
  definition_snapshots: SnapshotRow;
  definition_seeds: SeedRow;
}>;
