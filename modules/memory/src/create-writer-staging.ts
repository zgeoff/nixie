import invariant from 'tiny-invariant';
import type { MemorySubject } from './types';
import type { SourceMessage, StagedFlag, StagedWrite, WriterSubject } from './writer-types';

// The batch a writer session stages into: your messages it may cite, by sequence, and the version
// and subject of each item the session was shown, by item ID.
interface StagingBatch {
  readonly sources: ReadonlyMap<number, SourceMessage>;
  readonly shown: ReadonlyMap<string, ShownVersion>;
}

interface ShownVersion {
  readonly version: number;
  readonly subject: MemorySubject;
}

type StageResult =
  | { readonly status: 'staged' }
  | { readonly status: 'refused'; readonly reason: string };

// The writer's staging area: the batch the open session stages into, and the writes it staged. One
// batch is open at a time; opening one replaces any batch a lost step left open.
export interface WriterStaging {
  readonly open: (batch: StagingBatch) => StagingHandle;

  // records an item a recall showed the session, at the version and with the text it showed
  readonly show: (itemID: string, shown: ShownVersion, text: string) => void;
  readonly stage: (write: StagedWriteRequest) => StageResult;

  // flags a possible self-note for the assistant, which must cite one of your messages in the batch
  readonly flag: (flag: StagedFlag) => StageResult;
}

export interface StagingHandle {
  // closes this batch, if it is still the open one, and returns its writes in the order the
  // session staged them
  readonly close: () => readonly StagedWrite[];

  // the text of every item a recall showed this batch's session
  readonly readRecalledTexts: () => ReadonlySet<string>;

  // the possible self-notes this batch's session flagged, in the order it flagged them
  readonly readFlags: () => readonly StagedFlag[];
}

// A write as the session asks for it: a change names its item, and the host binds the version.
type StagedWriteRequest =
  | {
      readonly op: 'remember';
      readonly subject: WriterSubject;
      readonly text: string;
      readonly quote: string;
      readonly sourceSequence: number;
      readonly itemID: string | null;
    }
  | {
      readonly op: 'retire';
      readonly quote: string;
      readonly sourceSequence: number;
      readonly itemID: string;
    };

// Creates the staging area. A write cites one of your messages in the batch, and a change names an
// item the session was shown, once a batch and with its subject, so the publish checks each
// revision against the version the session read.
export function createWriterStaging(): WriterStaging {
  const state: { batch: OpenBatch | null } = { batch: null };

  return {
    open: (batch) => {
      const opened: OpenBatch = {
        sources: batch.sources,
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

interface OpenBatch {
  readonly sources: ReadonlyMap<number, SourceMessage>;
  readonly shown: Map<string, ShownVersion>;
  readonly writes: StagedWrite[];
  readonly flags: StagedFlag[];
  readonly touched: Set<string>;
  readonly recalledTexts: Set<string>;
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

// The write a request stages, bound to the version the session was shown, or why it is refused:
// a source outside the batch, an item the session was never shown, or a second change to an item.
function planStagedWrite(batch: OpenBatch, request: StagedWriteRequest): PlannedWrite {
  if (!batch.sources.has(request.sourceSequence)) {
    return { reason: buildSourceReason(request.sourceSequence) };
  }

  if (request.itemID === null) {
    // a retirement always names its item
    invariant(request.op === 'remember', 'a retirement staged with no item');

    return {
      op: 'remember',
      subject: request.subject,
      text: request.text,
      quote: request.quote,
      sourceSequence: request.sourceSequence,
      target: null,
    };
  }

  return planTargetedWrite(batch, { ...request, itemID: request.itemID });
}

type TargetedRequest = StagedWriteRequest & { readonly itemID: string };

// a change to an item the session was shown, once per batch, that keeps the item's subject
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
      };
}

function buildSourceReason(sequence: number): string {
  return `sourceID ${String(sequence)} is not one of the owner's messages in this batch`;
}
