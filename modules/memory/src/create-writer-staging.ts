import invariant from 'tiny-invariant';
import type { SourceMessage, StagedWrite } from './writer-types';

// The batch a writer session stages into: your messages it may cite, by sequence, and the version
// of each item the session was shown, by item ID.
interface StagingBatch {
  readonly sources: ReadonlyMap<number, SourceMessage>;
  readonly shown: ReadonlyMap<string, number>;
}

type StageResult =
  | { readonly status: 'staged' }
  | { readonly status: 'refused'; readonly reason: string };

// The writer's staging area: the batch the open session stages into, and the writes it staged. One
// batch is open at a time; opening one replaces any batch a lost step left open.
export interface WriterStaging {
  readonly open: (batch: StagingBatch) => StagingHandle;

  // records an item a recall showed the session, at the version and with the text it showed
  readonly show: (itemID: string, version: number, text: string) => void;
  readonly stage: (write: StagedWriteRequest) => StageResult;
}

export interface StagingHandle {
  // closes this batch, if it is still the open one, and returns its writes in the order the
  // session staged them
  readonly close: () => readonly StagedWrite[];

  // the text of every item a recall showed this batch's session
  readonly readRecalledTexts: () => ReadonlySet<string>;
}

// A write as the session asks for it: a change names its item, and the host binds the version.
type StagedWriteRequest =
  | {
      readonly op: 'remember';
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

// Creates the staging area. A write must cite one of your messages in the batch, and a change must
// name an item the session was shown, at most once a batch, so the batch holds at most one revision
// of each item and the publish checks each against the version the session read.
export function createWriterStaging(): WriterStaging {
  const state: { batch: OpenBatch | null } = { batch: null };

  return {
    open: (batch) => {
      const opened: OpenBatch = {
        sources: batch.sources,
        shown: new Map(batch.shown),
        writes: [],
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
      };
    },
    show: (itemID, version, text) => {
      state.batch?.shown.set(itemID, version);
      state.batch?.recalledTexts.add(text);
    },
    stage: (request) => {
      if (state.batch === null) {
        return { status: 'refused', reason: 'no batch is open' };
      }
      return updateStagedBatch(state.batch, request);
    },
  };
}

interface OpenBatch {
  readonly sources: ReadonlyMap<number, SourceMessage>;
  readonly shown: Map<string, number>;
  readonly writes: StagedWrite[];
  readonly touched: Set<string>;
  readonly recalledTexts: Set<string>;
}

// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the batch this stages into
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
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the batch this reads
function planStagedWrite(batch: OpenBatch, request: StagedWriteRequest): PlannedWrite {
  if (!batch.sources.has(request.sourceSequence)) {
    return {
      reason: `sourceID ${String(request.sourceSequence)} is not one of the owner's messages in this batch`,
    };
  }
  if (request.itemID === null) {
    // a retirement always names its item
    invariant(request.op === 'remember', 'a retirement staged with no item');
    return {
      op: 'remember',
      text: request.text,
      quote: request.quote,
      sourceSequence: request.sourceSequence,
      target: null,
    };
  }
  return planTargetedWrite(batch, { ...request, itemID: request.itemID });
}

type TargetedRequest = StagedWriteRequest & { readonly itemID: string };

// a change to an item the session was shown, once per batch
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the batch this reads
function planTargetedWrite(batch: OpenBatch, request: TargetedRequest): PlannedWrite {
  const version = batch.shown.get(request.itemID);

  if (version === undefined) {
    return {
      reason: `item ${request.itemID} is not one you were shown; find it with memory.recall first`,
    };
  }
  if (batch.touched.has(request.itemID)) {
    return {
      reason: `item ${request.itemID} already has a change in this batch; change each item at most once`,
    };
  }
  return { ...buildWriteFields(request), target: { itemID: request.itemID, version } };
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
        text: request.text,
        quote: request.quote,
        sourceSequence: request.sourceSequence,
      };
}
