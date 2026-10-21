import type { CheckedTables } from '@heynixie/db';
import type { ContentSource, JSONObject, RecordInput } from '@heynixie/log';
import type { Selectable } from 'kysely';
import type { MemorySubject, QuoteEvidence, VersionRef } from './types';
import type { ProposalPlan } from './write-memory-proposal';

export interface BatchMessage {
  readonly sequence: number;
  readonly role: 'owner' | 'assistant';

  readonly shown: string;
  readonly recordedAt: number;
}

export interface SourceSpan {
  readonly start: number;
  readonly end: number;
  readonly source: string;
}

export interface SourceMessage {
  readonly sequence: number;
  readonly text: string;
  readonly spans: readonly SourceSpan[];
}

export type WriterSubject = Exclude<MemorySubject, 'self'>;

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

export interface StagedFlag {
  readonly text: string;
  readonly sourceSequence: number;
}

export type GateVerdict =
  | {
      readonly outcome: 'apply';
      readonly source: ContentSource;
      readonly checks: JSONObject;
      readonly evidence: QuoteEvidence;

      readonly model: string;
    }
  | {
      readonly outcome: 'propose';
      readonly reason: string;

      readonly records: readonly RecordInput[];

      readonly plan: ProposalPlan | null;
    };

export interface WriterGate {
  readonly check: (
    write: StagedWrite,
    source: SourceMessage,
    batch: GateBatch,
  ) => Promise<GateVerdict | null>;

  readonly release: (verdicts: readonly GateVerdict[]) => Promise<void>;
}

export interface GateBatch {
  readonly bounds: BatchBounds;
  readonly model: string;
}

export interface WriterUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

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

export type BatchMode = 'catch_up' | 'live';

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

// A type alias, because Kysely's table map needs the index signature that an interface lacks.
export type WriterTables = CheckedTables<Readonly<{ memory_writer: MemoryWriterTable }>>;

export type WriterRow = Selectable<MemoryWriterTable>;
