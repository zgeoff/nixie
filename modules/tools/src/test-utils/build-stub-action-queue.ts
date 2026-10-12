import type { ActionOutcome, ActionQueue, QueuedAction } from '../types';

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

// Stands in for the server's action queue: a task's repeat of an action's tool and input gets its
// ID, and a wait answers the outcome once the action settles, or null while it is pending. The test
// decides when a wait times out, so no timer runs.
export function buildStubActionQueue(): StubActionQueue {
  const actions: QueuedEntry[] = [];
  const outcomes = buildOutcomeWaits();

  return {
    queue: {
      enqueue: (action) => {
        if (outcomes.isStopped()) {
          return Promise.reject(buildStoppedError());
        }
        const earlier = actions.find((entry) => isSameAction(entry.action, action));

        if (earlier !== undefined) {
          return Promise.resolve(earlier.actionID);
        }
        const actionID = crypto.randomUUID();

        actions.push({ actionID, action });
        return Promise.resolve(actionID);
      },
      waitForOutcome: (actionID, timeoutMs) =>
        actions.some((entry) => entry.actionID === actionID)
          ? outcomes.waitFor(actionID, timeoutMs)
          : Promise.reject(new Error(`the action queue holds no action ${actionID}`)),
    },
    actions,
    waits: outcomes.waits,
    writeOutcome: outcomes.writeOutcome,
    drainWaits: outcomes.drainWaits,
    stop: outcomes.stop,
  };
}

// the real queue keys an action by its task and a hash of its tool and its arguments
function isSameAction(left: QueuedAction, right: QueuedAction): boolean {
  return (
    left.run.thread === right.run.thread &&
    left.call.tool === right.call.tool &&
    JSON.stringify(left.call.input) === JSON.stringify(right.call.input)
  );
}

function buildOutcomeWaits() {
  const waits: OutcomeWait[] = [];
  const outcomes = new Map<string, ActionOutcome>();
  const pending = buildPendingWaits();
  const state = { stopped: false };

  return {
    waits,
    isStopped: () => state.stopped,
    waitFor: (actionID: string, timeoutMs: number): Promise<ActionOutcome | null> => {
      const outcome = outcomes.get(actionID);
      const wait = Promise.withResolvers<ActionOutcome | null>();

      waits.push({ actionID, timeoutMs });
      if (state.stopped) {
        wait.reject(buildStoppedError());
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

// the waits that hold no outcome yet; a drain removes and returns the waits for one action, or
// every wait when it names no action
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
