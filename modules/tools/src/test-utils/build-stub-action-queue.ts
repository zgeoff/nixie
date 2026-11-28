import invariant from 'tiny-invariant';
import type {
  ActionOutcome,
  ActionQueue,
  OpenAsk,
  OpenRepeat,
  QueuedAction,
  RepeatQuery,
} from '../types';

interface QueuedEntry {
  readonly actionID: string;
  readonly action: QueuedAction;
}

interface OutcomeWait {
  readonly actionID: string;
  readonly timeoutMs: number;
}

export interface StubActionQueue {
  readonly queue: ActionQueue;

  // queues the call and returns its action ID, which the stub never answers with an ask
  readonly enqueueAction: (action: QueuedAction) => Promise<string>;

  readonly actions: readonly QueuedEntry[];

  readonly waits: readonly OutcomeWait[];

  readonly writeOutcome: (actionID: string, outcome: ActionOutcome) => void;

  readonly drainWaits: () => void;

  readonly stop: () => void;
}

interface OpenProposal {
  readonly thread: string;
  readonly actionHash: string;
  readonly shortID: string;
}

export interface StubActionQueueOptions {
  // the proposals that still wait for the owner
  readonly openProposals?: readonly OpenProposal[];

  // the proposals the owner declined earlier in the task run
  readonly declinedProposals?: readonly OpenProposal[];

  // the tools whose approved actions the task's step runs
  readonly stepTools?: readonly string[];

  // How many repeat reads miss an open action, as when an approval commits after the call read.
  // The read in the proposal's transaction still finds it.
  readonly missedRepeatReads?: number;

  // the short ID of the proposal that every enqueue asks instead of queueing, as a lift's budget does
  readonly asksWith?: string;
}

export function buildStubActionQueue(options: StubActionQueueOptions = {}): StubActionQueue {
  const actions: QueuedEntry[] = [];
  const outcomes = buildOutcomeWaits();
  const reads = { missed: 0 };

  const findOpen = (query: RepeatQuery): OpenRepeat | null => {
    const earlier = actions.find(
      (entry) =>
        entry.action.run.thread === query.run.thread &&
        entry.action.actionHash === query.actionHash &&
        !outcomes.hasOutcome(entry.actionID),
    );

    return earlier === undefined
      ? null
      : {
          actionID: earlier.actionID,
          runsInStep: options.stepTools?.includes(earlier.action.call.tool) === true,
        };
  };

  const queue: ActionQueue = {
    enqueue: (action) => {
      if (outcomes.isStopped()) {
        return Promise.reject(buildStoppedError());
      }

      if (options.asksWith !== undefined) {
        return Promise.resolve({ status: 'asked', shortID: options.asksWith });
      }

      const earlier = actions.find((entry) => isSameAction(entry.action, action));

      if (earlier !== undefined) {
        return Promise.resolve({ status: 'queued', actionID: earlier.actionID });
      }

      const actionID = crypto.randomUUID();

      actions.push({ actionID, action });

      return Promise.resolve({ status: 'queued', actionID });
    },
    readOpenRepeat: (query) => {
      if (reads.missed < (options.missedRepeatReads ?? 0)) {
        reads.missed += 1;

        return Promise.resolve(null);
      }

      return Promise.resolve(findOpen(query));
    },
    readOpenAsk: (_tx, query) => {
      const repeat = findOpen(query);

      if (repeat !== null) {
        return Promise.resolve({ kind: 'action', repeat });
      }

      const declined = options.declinedProposals?.find(
        (earlier) => earlier.thread === query.run.thread && earlier.actionHash === query.actionHash,
      );

      if (declined !== undefined) {
        return Promise.resolve({ kind: 'declined', shortID: declined.shortID });
      }

      const proposal = options.openProposals?.find(
        (open) => open.thread === query.run.thread && open.actionHash === query.actionHash,
      );

      const ask: OpenAsk | null =
        proposal === undefined ? null : { kind: 'proposal', shortID: proposal.shortID };

      return Promise.resolve(ask);
    },
    waitForOutcome: (actionID, timeoutMs) =>
      actions.some((entry) => entry.actionID === actionID)
        ? outcomes.waitFor(actionID, timeoutMs)
        : Promise.reject(new Error(`the action queue holds no action ${actionID}`)),
  };

  return {
    queue,
    enqueueAction: async (action) => {
      const enqueued = await queue.enqueue(action);

      invariant(enqueued.status === 'queued', 'the stub queues every call');

      return enqueued.actionID;
    },
    actions,
    waits: outcomes.waits,
    writeOutcome: outcomes.writeOutcome,
    drainWaits: outcomes.drainWaits,
    stop: outcomes.stop,
  };
}

function buildOutcomeWaits() {
  const waits: OutcomeWait[] = [];

  const outcomes = new Map<string, ActionOutcome>();

  const pending = buildPendingWaits();
  const state = { stopped: false };

  return {
    waits,
    isStopped: () => state.stopped,
    hasOutcome: (actionID: string) => outcomes.has(actionID),
    waitFor: (actionID: string, timeoutMs: number): Promise<ActionOutcome | null> => {
      const outcome = outcomes.get(actionID);
      const wait = Promise.withResolvers<ActionOutcome | null>();

      waits.push({ actionID, timeoutMs });

      if (state.stopped) {
        wait.reject(buildStoppedError());
      } else if (outcome === undefined && timeoutMs === 0) {
        wait.resolve(null);
      } else if (outcome === undefined) {
        pending.add({ actionID, resolve: wait.resolve, reject: wait.reject });
      } else {
        wait.resolve(outcome);
      }

      return wait.promise;
    },
    writeOutcome: (actionID: string, outcome: ActionOutcome) => {
      outcomes.set(actionID, outcome);

      for (const wait of pending.drain(actionID)) {
        wait.resolve(outcome);
      }
    },
    drainWaits: () => {
      for (const wait of pending.drain()) {
        wait.resolve(null);
      }
    },
    stop: () => {
      state.stopped = true;

      for (const wait of pending.drain()) {
        wait.reject(buildStoppedError());
      }
    },
  };
}

interface PendingWait {
  readonly actionID: string;
  readonly resolve: (outcome: ActionOutcome | null) => void;
  readonly reject: (error: Error) => void;
}

function buildPendingWaits() {
  const pending = new Set<PendingWait>();

  return {
    add: (wait: PendingWait) => {
      pending.add(wait);
    },
    drain: (actionID?: string): PendingWait[] => {
      const drained = [...pending].filter((wait) => (actionID ?? wait.actionID) === wait.actionID);

      for (const wait of drained) {
        pending.delete(wait);
      }

      return drained;
    },
  };
}

function buildStoppedError(): Error {
  return new Error('the action queue stopped');
}

function isSameAction(left: QueuedAction, right: QueuedAction): boolean {
  return (
    left.run.thread === right.run.thread &&
    left.call.tool === right.call.tool &&
    JSON.stringify(left.call.input) === JSON.stringify(right.call.input)
  );
}
