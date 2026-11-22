import type { Clock } from '@heynixie/clock';
import type { Logger } from '@heynixie/logger';
import type { WatchConnection } from '../watch/types';
import type {
  HandBackRead,
  HandBackResult,
  TakeOverResult,
  Takeover,
  TakeoverEnd,
  TakeoverRecords,
} from './types';

export interface TakeoverDependencies {
  readonly clock: Clock;
  readonly logger: Logger;
  readonly records: TakeoverRecords;

  // how long a hold lasts with no input from its device
  readonly idleMs: number;

  // Waits for the calls already running, up to their own limit, and says whether they all finished.
  readonly waitForCalls: () => Promise<boolean>;

  // Keeps the sandbox awake until the returned function runs. A hold takes it from its start to its
  // end, so the sandbox never sleeps with a person at the desktop, and the guest it would stop for
  // the sleep stays.
  readonly keepAwake: () => () => void;

  // tells the guest a hold begins, so it starts listing the sites the browser shows
  readonly begin: () => Promise<void>;

  // reads the sites and the window in focus from the guest; null when no guest runs
  readonly finish: () => Promise<HandBackRead | null>;
}

type Phase =
  | { readonly kind: 'idle' }
  | {
      readonly kind: 'pending';
      readonly deviceID: string;
      readonly result: Promise<TakeOverResult>;
    }
  | {
      readonly kind: 'held';
      readonly deviceID: string;
      readonly startedAtMs: number;
      lastInputAtMs: number;
      readonly idle: AbortController;
      readonly releaseAwake: () => void;
    }

  // the hold has ended for its device, whose input stops, while the guest is read and the record
  // is written
  | { readonly kind: 'ending' };

interface TakeoverState {
  phase: Phase;
  epoch: number;
  readonly watches: Map<string, Set<WatchConnection>>;
}

// The hold on the desktop: one device session at a time. From the moment a take-over is called the
// assistant's new calls wait, and the take-over then waits for the calls already running.
export function makeTakeover(dependencies: TakeoverDependencies): Takeover {
  const state: TakeoverState = { phase: { kind: 'idle' }, epoch: 0, watches: new Map() };

  const takeover: Takeover = {
    isHeld: () => state.phase.kind !== 'idle',
    epoch: () => state.epoch,
    isHolder: (deviceID) => state.phase.kind === 'held' && state.phase.deviceID === deviceID,
    start: (deviceID) => startHold(dependencies, state, takeover, deviceID),
    end: (by, deviceID) => endHold(dependencies, state, by, deviceID),
    touch: (deviceID) => {
      if (state.phase.kind === 'held' && state.phase.deviceID === deviceID) {
        state.phase.lastInputAtMs = dependencies.clock.now();
      }
    },
    addWatch: (deviceID, watch) => {
      const set = state.watches.get(deviceID) ?? new Set();

      set.add(watch);
      state.watches.set(deviceID, set);

      return () => {
        set.delete(watch);
      };
    },
    stop: () => {
      if (state.phase.kind === 'held') {
        state.phase.idle.abort();
      }
    },
  };

  return takeover;
}

function startHold(
  dependencies: TakeoverDependencies,
  state: TakeoverState,
  takeover: Takeover,
  deviceID: string,
): Promise<TakeOverResult> {
  const phase = state.phase;

  if (phase.kind === 'held') {
    const answer: TakeOverResult =
      phase.deviceID === deviceID
        ? { kind: 'started', takenOverAt: phase.startedAtMs }
        : { kind: 'held_elsewhere' };

    return Promise.resolve(answer);
  }

  if (phase.kind === 'pending') {
    return phase.deviceID === deviceID ? phase.result : Promise.resolve({ kind: 'held_elsewhere' });
  }

  if (phase.kind === 'ending') {
    return Promise.resolve({ kind: 'held_elsewhere' });
  }

  const result = waitAndHold(dependencies, state, takeover, deviceID);

  state.phase = { kind: 'pending', deviceID, result };

  return result;
}

async function waitAndHold(
  dependencies: TakeoverDependencies,
  state: TakeoverState,
  takeover: Takeover,
  deviceID: string,
): Promise<TakeOverResult> {
  const isDrained = await dependencies.waitForCalls();

  if (!isDrained) {
    state.phase = { kind: 'idle' };

    return { kind: 'busy_too_long' };
  }

  try {
    await dependencies.begin();
  } catch (error) {
    dependencies.logger('computer.takeover_begin_failed', { reason: String(error) }, 'warn');
  }

  const startedAtMs = dependencies.clock.now();

  const idle = new AbortController();

  const releaseAwake = dependencies.keepAwake();

  state.phase = {
    kind: 'held',
    deviceID,
    startedAtMs,
    lastInputAtMs: startedAtMs,
    idle,
    releaseAwake,
  };

  state.epoch += 1;

  try {
    await dependencies.records.writeStarted({ device: deviceID });
  } catch (error) {
    dependencies.logger('computer.takeover_record_failed', { reason: String(error) }, 'error');
  }

  void watchIdle(dependencies, state, takeover);

  return { kind: 'started', takenOverAt: startedAtMs };
}

// Ends the hold with `idle` once its device has sent no input for the idle time.
async function watchIdle(
  dependencies: TakeoverDependencies,
  state: TakeoverState,
  takeover: Takeover,
): Promise<void> {
  const held = state.phase;

  if (held.kind !== 'held') {
    return;
  }

  while (state.phase === held && !held.idle.signal.aborted) {
    const waitMs = held.lastInputAtMs + dependencies.idleMs - dependencies.clock.now();

    if (waitMs <= 0) {
      await takeover.end('idle');

      return;
    }

    await dependencies.clock.sleep(waitMs, held.idle.signal);
  }
}

async function endHold(
  dependencies: TakeoverDependencies,
  state: TakeoverState,
  by: TakeoverEnd,
  deviceID: string | undefined,
): Promise<HandBackResult> {
  const held = state.phase;

  if (
    held.kind !== 'held' ||
    ((by === 'user' || deviceID !== undefined) && held.deviceID !== deviceID)
  ) {
    return { kind: 'not_taken_over' };
  }

  held.idle.abort();

  state.phase = { kind: 'ending' };

  for (const watch of state.watches.get(held.deviceID) ?? []) {
    watch.releaseInput();

    // the holder handed it back, or the hold ended on its own, which its viewer learns from the end
    // of its stream
    if (by !== 'user') {
      watch.closeAfterRelease();
    }
  }

  const read = by === 'restart' ? null : await readGuest(dependencies);
  const durationSeconds = Math.round((dependencies.clock.now() - held.startedAtMs) / 1000);

  try {
    await dependencies.records.writeEnded({ by, durationSeconds, read });
  } catch (error) {
    dependencies.logger('computer.takeover_record_failed', { reason: String(error) }, 'error');
  }

  state.epoch += 1;
  state.phase = { kind: 'idle' };

  held.releaseAwake();

  return { kind: 'ended', durationSeconds };
}

async function readGuest(dependencies: TakeoverDependencies): Promise<HandBackRead | null> {
  try {
    return await dependencies.finish();
  } catch (error) {
    dependencies.logger('computer.takeover_finish_failed', { reason: String(error) }, 'warn');

    return null;
  }
}
