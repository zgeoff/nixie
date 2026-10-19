import type { CheckedTables } from '@heynixie/db';
import type { ContentSource, JSONObject, RecordInput } from '@heynixie/log';
import type { Selectable } from 'kysely';
import type { MemorySubject, QuoteEvidence, VersionRef } from './types';
import type { ProposalPlan } from './write-memory-proposal';

// One record of the conversation as the writer reads it: your message, with each pasted span
// marked, or a reply. Your message's sequence is the ID a candidate cites as its source.
export interface BatchMessage {
  readonly sequence: number;
  readonly role: 'owner' | 'assistant';

  // the text, with each span you did not type wrapped in ⟦ ⟧ for your messages
  readonly shown: string;
  readonly recordedAt: number;
}

// A span of your message as the client labelled it.
export interface SourceSpan {
  readonly start: number;
  readonly end: number;
  readonly source: string;
}

// Your message that a candidate cites, as the gate reads it.
export interface SourceMessage {
  readonly sequence: number;
  readonly text: string;
  readonly spans: readonly SourceSpan[];
}

// The subjects the note-taker writes: a fact about you, or one between you and the assistant. A
// note about the assistant is the assistant's own to write, so the note-taker only flags one.
export type WriterSubject = Exclude<MemorySubject, 'self'>;

// A change the writer's model staged during a batch. The host binds each target to the version
// the session was shown, never to a version the model sent.
export type StagedWrite =
  | {
      readonly op: 'remember';
      readonly subject: WriterSubject;
      readonly text: string;
      readonly quote: string;
      readonly sourceSequence: number;
      readonly target: VersionRef | null;
    }
  | {
      readonly op: 'retire';
      readonly quote: string;
      readonly sourceSequence: number;
      readonly target: VersionRef;
    };

// A possible self-note the writer's model flagged for the assistant, from your message it cites. It
// creates no item: the assistant reads it as an event and decides whether to write the note.
export interface StagedFlag {
  readonly text: string;
  readonly sourceSequence: number;
}

// What the content gate decided for one staged write: apply it at once with the source and the
// evidence the checks set, or hold it as a proposal whose records the gate built.
export type GateVerdict =
  | {
      readonly outcome: 'apply';
      readonly source: ContentSource;
      readonly checks: JSONObject;
      readonly evidence: QuoteEvidence;

      // the model of the batch's session, which wrote the version
      readonly model: string;
    }
  | {
      readonly outcome: 'propose';
      readonly reason: string;

      // the proposal's records, which the batch publishes in its one transaction
      readonly records: readonly RecordInput[];

      // the change the proposal makes, which merges into a pending proposal of the same change
      // instead when the batch publishes, or null for a proposal that never merges
      readonly plan: ProposalPlan | null;
    };

// The content gate a batch write passes, which the memory checks supply. It checks a write against
// the source record it cites, never against a window of recent messages, and runs outside the
// publish transaction.
export interface WriterGate {
  // the verdict, or null for a write the gate drops: an edit of a self-note, which the note-taker
  // never makes, because a self-note is nixie's own voice about itself
  readonly check: (
    write: StagedWrite,
    source: SourceMessage,
    batch: GateBatch,
  ) => Promise<GateVerdict | null>;

  // removes what the gate made for each proposal that never published, such as a new item's key,
  // once the batch publishes, splits or fails
  readonly release: (verdicts: readonly GateVerdict[]) => Promise<void>;
}

// The batch a gated write belongs to, which its proposal names: the batch's bounds group its
// proposals and their notice, and the model is the writer session's.
export interface GateBatch {
  readonly bounds: BatchBounds;
  readonly model: string;
}

// The token counts of one writer session.
export interface WriterUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

// The writer's model: one fresh session for each batch, on the memory-writer role's profile, with
// the staging tools served to it. A session that fails throws.
export interface WriterModel {
  readonly model: string;
  readonly profile: string;
  readonly runSession: (session: WriterSessionInput) => Promise<WriterUsage>;
}

export interface WriterSessionInput {
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly signal: AbortSignal;
}

// Whether a batch covers records from before memory started, which the catch-up works through, or
// only records after it.
export type BatchMode = 'catch_up' | 'live';

// A batch with its fixed bounds: the records after start, up to and including end.
export interface BatchBounds {
  readonly start: number;
  readonly end: number;
}

interface MemoryWriterTable {
  readonly writer_id: string;
  readonly cursor: number;
  readonly start_sequence: number;
  readonly caught_up_sequence: number | null;
  readonly catch_up_applied: number;
  readonly pending_start: number | null;
  readonly pending_end: number | null;
  readonly batches: number;
  readonly last_batch_at: number | null;
  readonly failures: number;
  readonly retry_at: number | null;
  readonly last_error_code: string | null;
  readonly last_error_sequence: number | null;
  readonly last_error_at: number | null;
  readonly updated_sequence: number;
}

// mapped types, because Kysely's table map needs the index signature an interface lacks
export type WriterTables = CheckedTables<Readonly<{ memory_writer: MemoryWriterTable }>>;

export type WriterRow = Selectable<MemoryWriterTable>;
