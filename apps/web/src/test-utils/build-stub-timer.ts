export interface StubTimer {
  // starts a timer as the platform's setTimeout does, and returns its stop
  readonly startTimer: (onTimeout: () => void, ms: number) => () => void;

  // moves time forward and fires every timer whose due time it passed, earliest first
  readonly advance: (ms: number) => void;

  // how many timers are waiting to fire
  readonly countPending: () => number;
}

interface PendingTimer {
  readonly dueAt: number;
  readonly onTimeout: () => void;
}

// Stands in for the platform timer, so a test moves time forward instead of waiting for it. A timer
// fires once, and a stopped timer never fires.
export function buildStubTimer(): StubTimer {
  const state = { now: 0 };
  const pending = new Set<PendingTimer>();

  return {
    startTimer: (onTimeout, ms) => {
      const timer: PendingTimer = { dueAt: state.now + ms, onTimeout };

      pending.add(timer);
      return () => {
        pending.delete(timer);
      };
    },
    advance: (ms) => {
      state.now += ms;

      const due = [...pending]
        .filter((timer) => timer.dueAt <= state.now)
        .toSorted((a, b) => a.dueAt - b.dueAt);

      // an earlier callback can stop a later timer, which then stays unfired
      for (const timer of due) {
        if (pending.delete(timer)) {
          timer.onTimeout();
        }
      }
    },
    countPending: () => pending.size,
  };
}
