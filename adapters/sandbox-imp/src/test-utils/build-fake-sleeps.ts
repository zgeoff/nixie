import type { ImpClient } from '@impz/client';
import type { ImpPort } from '../types';

export interface FakeSleeps {
  // what a call did around an idle sleep: `wait <call> <imp>` when a sleep held it, and
  // `woken by exec <imp>` when an exec had to wake the imp itself
  readonly events: string[];

  // a sleep that starts when the imp wakes next, and ends when its snapshot promise settles
  readonly sleepsAfterWake: Map<string, Promise<void>>;

  readonly startIdleSleep: (name: string, snapshot: Promise<void>) => Promise<void>;

  // holds an exec until an idle sleep of the imp ends, then wakes the imp if the sleep left it asleep
  readonly waitForAwake: (name: string) => Promise<void>;

  // holds the adapter's wake until an idle sleep ends, and starts the sleep set for the wake
  readonly guardWake: (port: Pick<ImpPort, 'wakeImp'>) => Pick<ImpPort, 'wakeImp'>;
}

type SleepClient = Pick<ImpClient, 'imps' | 'requireAwake'>;

interface SleepState {
  readonly client: SleepClient;
  readonly events: string[];
  readonly sleeping: Map<string, Promise<void>>;
  readonly asleep: Set<string>;
}

// impd sleeps an idle imp on its own, at a moment no test can pick. This stand-in sleeps the imp at
// the moment the test picks, through the real impd, so a call can meet the sleep half done.
export function buildFakeSleeps(client: SleepClient): FakeSleeps {
  const state: SleepState = { client, events: [], sleeping: new Map(), asleep: new Set() };

  const sleepsAfterWake = new Map<string, Promise<void>>();

  return {
    events: state.events,
    sleepsAfterWake,
    startIdleSleep: (name, snapshot) => startIdleSleep(state, name, snapshot),
    waitForAwake: (name) => waitForAwake(state, name),
    guardWake: (port) => ({
      wakeImp: async (name) => {
        await waitForSleep(state, name, 'wake');

        state.asleep.delete(name);

        await port.wakeImp(name);

        const snapshot = sleepsAfterWake.get(name);

        if (snapshot !== undefined) {
          sleepsAfterWake.delete(name);
          void startIdleSleep(state, name, snapshot);
        }
      },
    }),
  };
}

function startIdleSleep(state: SleepState, name: string, snapshot: Promise<void>): Promise<void> {
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

  await state.client.imps.sleep({ name });

  state.asleep.add(name);
  state.sleeping.delete(name);
}

async function waitForAwake(state: SleepState, name: string): Promise<void> {
  await waitForSleep(state, name, 'exec');

  if (state.asleep.delete(name)) {
    state.events.push(`woken by exec ${name}`);

    await state.client.requireAwake(name);
  }
}

async function waitForSleep(state: SleepState, name: string, call: string): Promise<void> {
  const sleep = state.sleeping.get(name);

  if (sleep !== undefined) {
    state.events.push(`wait ${call} ${name}`);

    await sleep;
  }
}
