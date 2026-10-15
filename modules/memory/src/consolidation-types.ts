import type { CheckedTables } from '@heynixie/db';
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

  // the short ID the model reads and names the change by
  readonly shortID: string;
  readonly kind: ChangeKind;
  readonly inputs: readonly ChangeInput[];

  // the text the change writes, or null for a retirement
  readonly text: string | null;
  readonly reason: string;
  readonly source: ContentSource;
  readonly actionHash: string;
  readonly lapseAt: number;

  // the conversation's comment on the change, or null when it left none
  readonly comment: ChangeComment | null;
}

// What the conversation said about a change, for your review beside it, and when it said it.
export interface ChangeComment {
  readonly text: string;
  readonly at: number;
}

// The pending changes of one consolidator run, in the order the run proposed them, and the summary
// its session left for you.
export interface ConsolidationDiff {
  readonly diffID: string;
  readonly model: string | null;
  readonly createdAt: number;
  readonly changes: readonly ConsolidationChange[];

  // null when the session left none, or once a forget made it unreadable
  readonly summary: ConsolidationSummary | null;
}

// What a run's session told you about its diff, such as the 2 items it left alone because they
// conflict, and the items whose keys it is sealed under: every item the session was shown.
export interface ConsolidationSummary {
  readonly text: string;
  readonly itemIDs: readonly string[];
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

// The conversation's comment on one pending change, which it names by its short ID or its UUID. A
// later comment on the same change replaces the one before.
export interface ChangeCommentRequest {
  readonly changeID: string;
  readonly text: string;

  // the task run that left the comment
  readonly runID: string;
}

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

  // the pending diff as the model may read it, under the delivery lock, with every change that
  // has a forgetting or forgotten input left out
  readonly readDelivered: () => Promise<ConsolidationDiff | null>;
  readonly readSchedule: () => Promise<ConsolidationSchedule>;

  // applies one change under the hash you saw, with its own approval record
  readonly approve: (answer: ChangeAnswer) => Promise<readonly VersionRef[]>;

  // approves each change in order, each with its own approval record; a refused change applies
  // nothing and leaves the rest to go on
  readonly approveAll: (answers: readonly ChangeAnswer[]) => Promise<readonly ChangeOutcome[]>;
  readonly reject: (answer: ChangeAnswer) => Promise<void>;

  // keeps the conversation's comment beside a pending change, answers nothing, and returns the
  // change's short ID
  readonly comment: (request: ChangeCommentRequest) => Promise<string>;

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

  // the summary sealed under a fresh key, and JSON of each shown item's sealed share of that key
  readonly summary: string | null;
  readonly summary_shares: string | null;
  readonly summary_lapse_at: number | null;
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

  // null only on a row an older build wrote after the migration that added it
  readonly short_id: string | null;

  // the conversation's comment, sealed as the change's text is, and the record that left it
  readonly comment: string | null;
  readonly comment_sequence: number | null;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type ConsolidationTables = CheckedTables<
  Readonly<{
    memory_consolidations: ConsolidationTable;
    memory_consolidation_changes: ConsolidationChangeTable;
  }>
>;

export type ConsolidationChangeRow = Selectable<ConsolidationChangeTable>;
