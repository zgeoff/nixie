import { setImmediate as waitForTurn } from 'node:timers/promises';
import type { ImpForward } from '../types';

export interface SleepingForward extends ImpForward {
  readonly stopAsLost: () => void;
}

export interface FakeSleeps {
  readonly sleepsAfterWake: Map<string, Promise<void>>;

  readonly startIdleSleep: (name: string, snapshot: Promise<void>) => Promise<void>;

  readonly startSleepAfterWake: (name: string) => void;

  readonly waitForAwake: (name: string, call: string) => Promise<void>;

  readonly registerForward: (name: string, forward: SleepingForward) => void;
}

interface SleepState {
  readonly calls: string[];

  readonly sleeping: Map<string, Promise<void>>;

  readonly asleep: Set<string>;
  readonly forwards: Map<string, Set<SleepingForward>>;
}

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

async function updateOpenForwards(
  open: Set<SleepingForward>,

  forward: SleepingForward,
): Promise<void> {
  try {
    await forward.listening;
  } catch {
    return;
  }

  open.add(forward);

  await forward.ended;

  open.delete(forward);
}
