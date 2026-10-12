import type { ActionOutcome, ActionQueue, QueuedAction } from '../types';

export interface QueuedEntry {
  readonly actionID: string;
  readonly action: QueuedAction;
}

export interface OutcomeWait {
  readonly actionID: string;
  readonly timeoutMs: number;
}

export interface StubActionQueue {
  readonly queue: ActionQueue;

  // every action the queue holds, in the order it first queued them
  readonly actions: readonly QueuedEntry[];

  // every wait for an outcome the queue received, in order
  readonly waits: readonly OutcomeWait[];

  // settles the action: each wait for it, pending or later, answers this outcome
  readonly writeOutcome: (actionID: string, outcome: ActionOutcome) => void;

  // ends every pending wait with null, as its timeout would while the action stays pending
  readonly drainWaits: () => void;

  // takes the queue out of service: every pending wait and every later call rejects
  readonly stop: () => void;
}

// Stands in for the server's action queue: a repeat of an action's tool and input gets its ID, and
// a wait answers the outcome once the action settles, or null while it is pending. The test decides
// when a wait times out, so no timer runs.
export function buildStubActionQueue(): StubActionQueue {
  const state: QueueState = {
    actions: [],
    waits: [],
    outcomes: new Map(),
    pending: new Set(),
    stopped: false,
  };

  return {
    queue: { enqueue: makeEnqueue(state), waitForOutcome: makeWaitForOutcome(state) },
    actions: state.actions,
    waits: state.waits,
    writeOutcome: (actionID, outcome) => {
      state.outcomes.set(actionID, outcome);
      drainPending(
        state,
        (wait) => wait.actionID === actionID,
        (wait) => wait.resolve(outcome),
      );
    },
    drainWaits: () => {
      drainPending(
        state,
        () => true,
        (wait) => wait.resolve(null),
      );
    },
    stop: () => {
      state.stopped = true;
      drainPending(
        state,
        () => true,
        (wait) => wait.reject(buildStoppedError()),
      );
    },
  };
}

interface PendingWait {
  readonly actionID: string;
  readonly resolve: (outcome: ActionOutcome | null) => void;
  readonly reject: (error: Error) => void;
}

interface QueueState {
  readonly actions: QueuedEntry[];
  readonly waits: OutcomeWait[];
  readonly outcomes: Map<string, ActionOutcome>;
  readonly pending: Set<PendingWait>;
  stopped: boolean;
}

function makeEnqueue(state: QueueState): ActionQueue['enqueue'] {
  return (action) => {
    if (state.stopped) {
      return Promise.reject(buildStoppedError());
    }
    const earlier = state.actions.find((entry) => isSameAction(entry.action, action));

    if (earlier !== undefined) {
      return Promise.resolve(earlier.actionID);
    }
    const actionID = crypto.randomUUID();

    state.actions.push({ actionID, action });
    return Promise.resolve(actionID);
  };
}

// the real queue keys an action by a hash of its tool and its arguments
function isSameAction(left: QueuedAction, right: QueuedAction): boolean {
  return (
    left.call.tool === right.call.tool &&
    JSON.stringify(left.call.input) === JSON.stringify(right.call.input)
  );
}

function makeWaitForOutcome(state: QueueState): ActionQueue['waitForOutcome'] {
  return (actionID, timeoutMs) => {
    state.waits.push({ actionID, timeoutMs });
    if (state.stopped) {
      return Promise.reject(buildStoppedError());
    }
    if (!state.actions.some((entry) => entry.actionID === actionID)) {
      return Promise.reject(new Error(`the action queue holds no action ${actionID}`));
    }
    const outcome = state.outcomes.get(actionID);

    return outcome === undefined ? waitForSettle(state, actionID) : Promise.resolve(outcome);
  };
}

function waitForSettle(state: QueueState, actionID: string): Promise<ActionOutcome | null> {
  const wait = Promise.withResolvers<ActionOutcome | null>();

  state.pending.add({ actionID, resolve: wait.resolve, reject: wait.reject });
  return wait.promise;
}

function drainPending(
  state: QueueState,
  isMatch: (wait: PendingWait) => boolean,
  settle: (wait: PendingWait) => void,
): void {
  for (const wait of state.pending) {
    if (isMatch(wait)) {
      state.pending.delete(wait);
      settle(wait);
    }
  }
}

function buildStoppedError(): Error {
  return new Error('the action queue stopped');
}
