import type { ContentSource } from '@heynixie/log';
import type { Selectable } from 'kysely';
import type { VersionRef } from './types';

// The types of memory consolidation: the diff a consolidator run proposes, its changes, and your
// answers to them.

export type ChangeKind = 'merge' | 'rewrite' | 'retire';

// One change the consolidator staged, bound to the versions its session read. A merge writes its
// text as the next version of its first input and retires the rest; a rewrite gives one item new
// text; a retirement ends one item. The reason says why, for your review.
export type StagedChange =
  | {
      readonly kind: 'merge';
      readonly inputs: readonly [VersionRef, ...VersionRef[]];
      readonly text: string;
      readonly reason: string;
      readonly source: ContentSource;
    }
  | {
      readonly kind: 'rewrite';
      readonly inputs: readonly [VersionRef];
      readonly text: string;
      readonly reason: string;
      readonly source: ContentSource;
    }
  | {
      readonly kind: 'retire';
      readonly inputs: readonly [VersionRef];
      readonly reason: string;
      readonly source: ContentSource;
    };

type ChangeStatus = 'pending' | 'consumed' | 'rejected' | 'lapsed';

// One input of a change as your review reads it: the version the change read, its text then, and
// whether the item still stands at that version.
export interface ChangeInput {
  readonly itemID: string;
  readonly version: number;

  // the input's text at the version read, or null once its key is gone
  readonly text: string | null;
  readonly isCurrent: boolean;
}

// One change of a diff as your review reads it, with its sealed text opened.
export interface ConsolidationChange {
  readonly changeID: string;
  readonly kind: ChangeKind;
  readonly inputs: readonly ChangeInput[];

  // the text the change writes, or null for a retirement
  readonly text: string | null;
  readonly reason: string;
  readonly source: ContentSource;
  readonly actionHash: string;
  readonly lapseAt: number;
}

// The pending changes of one consolidator run, in the order the run proposed them.
export interface ConsolidationDiff {
  readonly diffID: string;
  readonly model: string | null;
  readonly createdAt: number;
  readonly changes: readonly ConsolidationChange[];
}

// Your answer to one change, bound to the action hash your review showed.
export interface ChangeAnswer {
  readonly changeID: string;
  readonly actionHash: string;
  readonly identityID: string;
}

// What an approval of one change of a whole diff did: it applied the versions it wrote, or it
// failed with the code of the error that refused it, such as a stale version, and applied nothing.
export type ChangeOutcome =
  | {
      readonly changeID: string;
      readonly status: 'applied';
      readonly versions: readonly VersionRef[];
    }
  | { readonly changeID: string; readonly status: 'refused'; readonly code: string };

// When the consolidator last ran, and the changes that still wait for your answer.
export interface ConsolidationSchedule {
  // the time the last run proposed its diff, or null before the first run
  readonly lastRunAt: number | null;
  readonly pending: number;

  // the earliest lapse time among the pending changes, or null with none pending
  readonly nextLapseAt: number | null;
}

// The diffs, your answers to their changes, and their lapses.
export interface MemoryConsolidations {
  readonly readPending: () => Promise<ConsolidationDiff | null>;
  readonly readSchedule: () => Promise<ConsolidationSchedule>;

  // applies one change under the hash you saw, with its own approval record
  readonly approve: (answer: ChangeAnswer) => Promise<readonly VersionRef[]>;

  // approves each change in order, each with its own approval record; a refused change applies
  // nothing and leaves the rest to go on
  readonly approveAll: (answers: readonly ChangeAnswer[]) => Promise<readonly ChangeOutcome[]>;
  readonly reject: (answer: ChangeAnswer) => Promise<void>;

  // lapses every pending change past its lapse time, and returns how many
  readonly lapse: () => Promise<number>;
}

interface ConsolidationTable {
  readonly diff_id: string;
  readonly model: string | null;
  readonly changes: number;
  readonly shown_items: number;
  readonly sequence: number;
  readonly created_at: number;
}

interface ConsolidationChangeTable {
  readonly change_id: string;
  readonly diff_id: string;
  readonly position: number;
  readonly kind: ChangeKind;
  readonly item_id: string;

  // JSON of the inputs' item IDs and the versions read, first input first
  readonly inputs: string;
  readonly source: ContentSource;
  readonly status: ChangeStatus;
  readonly action_hash: string;
  readonly sealed: string;
  readonly model: string | null;
  readonly created_sequence: number;
  readonly created_at: number;
  readonly lapse_at: number;
  readonly resolved_sequence: number | null;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type ConsolidationTables = Readonly<{
  memory_consolidations: ConsolidationTable;
  memory_consolidation_changes: ConsolidationChangeTable;
}>;

export type ConsolidationChangeRow = Selectable<ConsolidationChangeTable>;
