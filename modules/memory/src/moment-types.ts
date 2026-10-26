import type { CheckedTables } from '@heynixie/db';
import type { MemoryContext } from './types';

export type MomentContext = Pick<MemoryContext, 'log' | 'definitions'>;

type MomentState = 'active' | 'retired' | 'destroying' | 'destroyed';

interface MomentTable {
  readonly moment_id: string;
  readonly short_id: string;
  readonly thread: string;
  readonly first_sequence: number;
  readonly last_sequence: number;
  readonly state: MomentState;
  readonly version: number;
  readonly kept_by: 'owner' | 'model';
  readonly kept_thread: string | null;
  readonly kept_model: string | null;
  readonly kept_at: number;
  readonly kept_sequence: number;
  readonly title_sequence: number;
  readonly note_sequence: number | null;
  readonly edited_at: number | null;
  readonly updated_sequence: number;
}

interface MomentReflectionTable {
  readonly reflection_id: string;
  readonly moment_id: string;
  readonly model: string;
  readonly text_sequence: number;
  readonly created_at: number;
  readonly updated_at: number;
  readonly is_removed: number;
}

interface MomentLinkTable {
  readonly link_key: string;
  readonly moment_id: string;
  readonly item_id: string;
  readonly linked_sequence: number;
}

interface MomentTextTable {
  readonly sequence: number;
  readonly moment_id: string;
}

// A type alias, because Kysely's table map needs the index signature that an interface lacks.
export type MomentTables = CheckedTables<
  Readonly<{
    moments: MomentTable;
    moment_reflections: MomentReflectionTable;
    moment_links: MomentLinkTable;
    moment_texts: MomentTextTable;
  }>
>;

// The owner acts through the client; a model acts through a tool call on its run's thread.
export type MomentCaller =
  | { readonly kind: 'owner' }
  | { readonly kind: 'model'; readonly thread: string; readonly model: string };

export interface MomentTarget {
  readonly momentID: string;
  readonly version: number;
}

export interface MomentSpan {
  readonly firstSequence: number;
  readonly lastSequence: number;
}

export interface KeepMomentRequest extends MomentSpan {
  readonly caller: MomentCaller;
  readonly thread: string;
  readonly title: string;
}

export type MomentChange =
  | ({ readonly kind: 'edges' } & MomentSpan)
  | { readonly kind: 'title'; readonly title: string }
  | { readonly kind: 'note'; readonly note: string }
  | { readonly kind: 'reflection'; readonly text: string; readonly reflectionID?: string }
  | { readonly kind: 'reflection_removed'; readonly reflectionID: string };

export interface EditMomentRequest {
  readonly caller: MomentCaller;
  readonly target: MomentTarget;
  readonly change: MomentChange;
}

export interface LinkMomentRequest {
  readonly caller: MomentCaller;
  readonly target: MomentTarget;
  readonly itemID: string;
  readonly isLinked: boolean;
}

export interface RetireMomentRequest {
  readonly caller: MomentCaller;
  readonly target: MomentTarget;
  readonly isRetired: boolean;
}

export type MomentRefusal =
  | 'not_found'
  | 'stale'
  | 'wrong_state'
  | 'bad_span'
  | 'other_thread'
  | 'memory_writer'
  | 'owner_only'
  | 'model_only'
  | 'reflection_not_found'
  | 'not_your_reflection'
  | 'item_not_found'
  | 'already_linked'
  | 'not_linked';

export type MomentWrite =
  | {
      readonly status: 'written';
      readonly momentID: string;
      readonly shortID: string;
      readonly version: number;
      readonly sequence: number;
      readonly reflectionID?: string;
    }
  | { readonly status: 'refused'; readonly reason: MomentRefusal };
