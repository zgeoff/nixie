import type { ContentSource, JSONObject, RecordInput } from '@heynixie/log';
import type { Selectable } from 'kysely';
import type { QuoteEvidence, VersionRef } from './types';

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

// A change the writer's model staged during a batch. The host binds each target to the version
// the session was shown, never to a version the model sent.
export type StagedWrite =
  | {
      readonly op: 'remember';
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

// What the content gate decided for one staged write: apply it at once with the source and the
// evidence the checks set, or hold it as a proposal whose records the gate built.
export type GateVerdict =
  | {
      readonly outcome: 'apply';
      readonly source: ContentSource;
      readonly checks: JSONObject;
      readonly evidence: QuoteEvidence;
    }
  | {
      readonly outcome: 'propose';
      readonly reason: string;

      // the proposal's records, which the batch publishes in its one transaction
      readonly records: readonly RecordInput[];
    };

// The content gate a batch write passes, which the memory checks supply. It checks a write against
// the source record it cites, never against a window of recent messages, and runs outside the
// publish transaction.
export interface WriterGate {
  readonly check: (write: StagedWrite, source: SourceMessage) => Promise<GateVerdict>;
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
export type WriterTables = Readonly<{ memory_writer: MemoryWriterTable }>;

export type WriterRow = Selectable<MemoryWriterTable>;
