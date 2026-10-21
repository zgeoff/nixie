import type { CheckedTables } from '@heynixie/db';
import type { ContentSource } from '@heynixie/log';
import type { Selectable } from 'kysely';
import type { VersionRef } from './types';

export type ChangeKind = 'merge' | 'rewrite' | 'retire';

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

export interface ChangeInput {
  readonly itemID: string;
  readonly version: number;

  readonly text: string | null;
  readonly isCurrent: boolean;
}

export interface ConsolidationChange {
  readonly changeID: string;

  readonly shortID: string;
  readonly kind: ChangeKind;
  readonly inputs: readonly ChangeInput[];

  readonly text: string | null;
  readonly reason: string;
  readonly source: ContentSource;
  readonly actionHash: string;
  readonly lapseAt: number;

  readonly comment: ChangeComment | null;
}

export interface ChangeComment {
  readonly text: string;
  readonly at: number;
}

export interface ConsolidationDiff {
  readonly diffID: string;
  readonly model: string | null;
  readonly createdAt: number;
  readonly changes: readonly ConsolidationChange[];

  readonly summary: ConsolidationSummary | null;
}

export interface ConsolidationSummary {
  readonly text: string;
  readonly itemIDs: readonly string[];
}

export interface ChangeAnswer {
  readonly changeID: string;
  readonly actionHash: string;
  readonly identityID: string;
}

export type ChangeOutcome =
  | {
      readonly changeID: string;
      readonly status: 'applied';
      readonly versions: readonly VersionRef[];
    }
  | { readonly changeID: string; readonly status: 'refused'; readonly code: string };

export interface ChangeCommentRequest {
  readonly changeID: string;
  readonly text: string;

  readonly runID: string;
}

export interface ConsolidationSchedule {
  readonly lastRunAt: number | null;
  readonly pending: number;

  readonly nextLapseAt: number | null;
}

export interface MemoryConsolidations {
  readonly readPending: () => Promise<ConsolidationDiff | null>;

  readonly readDelivered: () => Promise<ConsolidationDiff | null>;
  readonly readSchedule: () => Promise<ConsolidationSchedule>;

  readonly approve: (answer: ChangeAnswer) => Promise<readonly VersionRef[]>;

  readonly approveAll: (answers: readonly ChangeAnswer[]) => Promise<readonly ChangeOutcome[]>;
  readonly reject: (answer: ChangeAnswer) => Promise<void>;

  readonly comment: (request: ChangeCommentRequest) => Promise<string>;

  readonly lapse: () => Promise<number>;
}

interface ConsolidationTable {
  readonly diff_id: string;
  readonly model: string | null;
  readonly changes: number;
  readonly shown_items: number;
  readonly sequence: number;
  readonly created_at: number;

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

  readonly short_id: string | null;

  readonly comment: string | null;
  readonly comment_sequence: number | null;
}

// A type alias, because Kysely's table map needs the index signature that an interface lacks.
export type ConsolidationTables = CheckedTables<
  Readonly<{
    memory_consolidations: ConsolidationTable;
    memory_consolidation_changes: ConsolidationChangeTable;
  }>
>;

export type ConsolidationChangeRow = Selectable<ConsolidationChangeTable>;
