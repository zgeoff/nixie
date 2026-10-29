import invariant from 'tiny-invariant';
import type { MemorySubject } from './types';
import type { SourceMessage, StagedFlag, StagedWrite, WriterSubject } from './writer-types';

interface ShownVersion {
  readonly version: number;
  readonly subject: MemorySubject;
}

interface StagingBatch {
  readonly sources: ReadonlyMap<number, SourceMessage>;
  readonly shown: ReadonlyMap<string, ShownVersion>;
  readonly startedAt: number;
}

type StageResult =
  | { readonly status: 'staged' }
  | { readonly status: 'refused'; readonly reason: string };

export interface StagingHandle {
  readonly close: () => readonly StagedWrite[];

  readonly readRecalledTexts: () => ReadonlySet<string>;

  readonly readFlags: () => readonly StagedFlag[];
}

type StagedWriteRequest =
  | {
      readonly op: 'remember';
      readonly subject: WriterSubject;
      readonly text: string;
      readonly quote: string;
      readonly sourceSequence: number;
      readonly itemID: string | null;

      readonly until?: number | null;

      readonly isSensitive?: boolean;
    }
  | {
      readonly op: 'retire';
      readonly quote: string;
      readonly sourceSequence: number;
      readonly itemID: string;
    };

export interface WriterStaging {
  readonly open: (batch: StagingBatch) => StagingHandle;

  readonly show: (itemID: string, shown: ShownVersion, text: string) => void;
  readonly stage: (write: StagedWriteRequest) => StageResult;

  readonly flag: (flag: StagedFlag) => StageResult;
}

interface OpenBatch {
  readonly sources: ReadonlyMap<number, SourceMessage>;
  readonly startedAt: number;
  readonly shown: Map<string, ShownVersion>;
  readonly writes: StagedWrite[];
  readonly flags: StagedFlag[];
  readonly touched: Set<string>;
  readonly recalledTexts: Set<string>;
}

export function createWriterStaging(): WriterStaging {
  const state: { batch: OpenBatch | null } = { batch: null };

  return {
    open: (batch) => {
      const opened: OpenBatch = {
        sources: batch.sources,
        startedAt: batch.startedAt,
        shown: new Map(batch.shown),
        writes: [],
        flags: [],
        touched: new Set(),
        recalledTexts: new Set(),
      };

      state.batch = opened;

      return {
        close: () => {
          if (state.batch === opened) {
            state.batch = null;
          }

          return opened.writes;
        },
        readRecalledTexts: () => opened.recalledTexts,
        readFlags: () => opened.flags,
      };
    },
    show: (itemID, shown, text) => {
      state.batch?.shown.set(itemID, shown);
      state.batch?.recalledTexts.add(text);
    },
    stage: (request) => {
      if (state.batch === null) {
        return { status: 'refused', reason: 'no batch is open' };
      }

      return updateStagedBatch(state.batch, request);
    },
    flag: (flag) => {
      if (state.batch === null) {
        return { status: 'refused', reason: 'no batch is open' };
      }

      if (!state.batch.sources.has(flag.sourceSequence)) {
        return { status: 'refused', reason: buildSourceReason(flag.sourceSequence) };
      }

      state.batch.flags.push(flag);

      return { status: 'staged' };
    },
  };
}

function updateStagedBatch(batch: OpenBatch, request: StagedWriteRequest): StageResult {
  const planned = planStagedWrite(batch, request);

  if ('reason' in planned) {
    return { status: 'refused', reason: planned.reason };
  }

  if (planned.target !== null) {
    batch.touched.add(planned.target.itemID);
  }

  batch.writes.push(planned);

  return { status: 'staged' };
}

type PlannedWrite = StagedWrite | { readonly reason: string };

function planStagedWrite(batch: OpenBatch, request: StagedWriteRequest): PlannedWrite {
  if (!batch.sources.has(request.sourceSequence)) {
    return { reason: buildSourceReason(request.sourceSequence) };
  }

  if (request.op === 'remember' && isUntilPassed(request.until, batch.startedAt)) {
    return {
      reason:
        'that end time passed before this batch ran, so the fact has already lapsed; stage nothing for it',
    };
  }

  if (request.itemID === null) {
    invariant(request.op === 'remember', 'a retirement staged with no item');

    return {
      op: 'remember',
      subject: request.subject,
      text: request.text,
      quote: request.quote,
      sourceSequence: request.sourceSequence,
      target: null,
      ...(request.until === undefined ? {} : { until: request.until }),
      ...(request.isSensitive === true ? { isSensitive: true } : {}),
    };
  }

  return planTargetedWrite(batch, { ...request, itemID: request.itemID });
}

function buildSourceReason(sequence: number): string {
  return `sourceID ${String(sequence)} is not one of the owner's messages in this batch`;
}

function isUntilPassed(until: number | null | undefined, startedAt: number): boolean {
  return until !== undefined && until !== null && until <= startedAt;
}

type TargetedRequest = StagedWriteRequest & { readonly itemID: string };

function planTargetedWrite(batch: OpenBatch, request: TargetedRequest): PlannedWrite {
  const shown = batch.shown.get(request.itemID);

  if (shown === undefined) {
    return {
      reason: `item ${request.itemID} is not one you were shown; find it with memory.recall first`,
    };
  }

  if (batch.touched.has(request.itemID)) {
    return {
      reason: `item ${request.itemID} already has a change in this batch; change each item at most once`,
    };
  }

  if (request.op === 'remember' && request.subject !== shown.subject) {
    return {
      reason: `item ${request.itemID} has the subject ${shown.subject}; an edit keeps its item's subject`,
    };
  }

  return {
    ...buildWriteFields(request),
    target: { itemID: request.itemID, version: shown.version },
  };
}

function buildWriteFields(
  request: StagedWriteRequest,
):
  | Omit<Extract<StagedWrite, { readonly op: 'remember' }>, 'target'>
  | Omit<Extract<StagedWrite, { readonly op: 'retire' }>, 'target'> {
  return request.op === 'retire'
    ? { op: 'retire', quote: request.quote, sourceSequence: request.sourceSequence }
    : {
        op: 'remember',
        subject: request.subject,
        text: request.text,
        quote: request.quote,
        sourceSequence: request.sourceSequence,
        ...(request.until === undefined ? {} : { until: request.until }),
      };
}
