import { setImmediate as waitForTurn } from 'node:timers/promises';
import type { ImpForward } from '../types';

// A forward as a sleep ends it: the VM it listens on stops, so it ends as lost.
export interface SleepingForward extends ImpForward {
  readonly stopAsLost: () => void;
}

export interface FakeSleeps {
  // the idle sleep each imp's next wake starts, as an idle check that lands just after a wake does
  readonly sleepsAfterWake: Map<string, Promise<void>>;

  // Starts an idle sleep as impd 1.2.0 takes one: it holds the imp until the snapshot resolves, then
  // ends each listening forward as lost, and frees the imp asleep.
  readonly startIdleSleep: (name: string, snapshot: Promise<void>) => Promise<void>;

  // starts the idle sleep set for the imp's next wake, if any
  readonly startSleepAfterWake: (name: string) => void;

  // a call that needs the imp running waits for a sleep in progress, then wakes the imp it left
  readonly waitForAwake: (name: string, call: string) => Promise<void>;

  // counts the forward as open on the imp from its listen to its end
  readonly registerForward: (name: string, forward: SleepingForward) => void;
}

interface SleepState {
  readonly calls: string[];

  // each idle sleep in progress, by imp, which holds the imp as impd's lock does until it ends
  readonly sleeping: Map<string, Promise<void>>;

  // the imps an idle sleep left asleep, which the next wake, exec or listen wakes
  readonly asleep: Set<string>;
  readonly forwards: Map<string, Set<SleepingForward>>;
}

// The fake impd's idle sleeps, which log to its call log: `idle-sleep`, `wait <call>`, `slept` and
// `woken by <call>`, each with the imp's name.
export function buildFakeSleeps(calls: string[]): FakeSleeps {
  const state: SleepState = { calls, sleeping: new Map(), asleep: new Set(), forwards: new Map() };

  const sleepsAfterWake = new Map<string, Promise<void>>();

  return {
    sleepsAfterWake,
    startIdleSleep: (name, snapshot) => startIdleSleep(state, name, snapshot),
    startSleepAfterWake: (name) => {
      const snapshot = sleepsAfterWake.get(name);

      if (snapshot !== undefined) {
        sleepsAfterWake.delete(name);
        void startIdleSleep(state, name, snapshot);
      }
    },
    waitForAwake: (name, call) => waitForAwake(state, name, call),
    registerForward: (name, forward) => {
      const open = state.forwards.get(name) ?? new Set();

      state.forwards.set(name, open);
      void updateOpenForwards(open, forward);
    },
  };
}

function startIdleSleep(state: SleepState, name: string, snapshot: Promise<void>): Promise<void> {
  state.calls.push(`idle-sleep ${name}`);

  const sleep = runIdleSleep(state, name, snapshot);

  state.sleeping.set(name, sleep);

  return sleep;
}

// impd ends the forwards once the snapshot is written and the VM stops, then still trims and
// flushes the snapshot before it frees the imp, so the forwards end before a waiting call runs
async function runIdleSleep(
  state: SleepState,
  name: string,
  snapshot: Promise<void>,
): Promise<void> {
  await snapshot;

  for (const forward of state.forwards.get(name) ?? []) {
    forward.stopAsLost();
  }

  state.calls.push(`slept ${name}`);

  await waitForTurn();

  state.asleep.add(name);
  state.sleeping.delete(name);
}

async function waitForAwake(state: SleepState, name: string, call: string): Promise<void> {
  const sleep = state.sleeping.get(name);

  if (sleep !== undefined) {
    state.calls.push(`wait ${call} ${name}`);

    await sleep;
  }

  if (state.asleep.delete(name)) {
    state.calls.push(`woken by ${call} ${name}`);
  }
}

// a sleep ends only the forwards that listen on the imp it stops, never one that waits for the wake
async function updateOpenForwards(
  open: Set<SleepingForward>,

  forward: SleepingForward,
): Promise<void> {
  try {
    await forward.listening;
  } catch {
    // a forward that never listened was never open
    return;
  }

  open.add(forward);

  await forward.ended;

  open.delete(forward);
}
