import { onTestFinished } from 'bun:test';
import type { NixieProcess } from './start-nixie-process';
import { startNixieProcess } from './start-nixie-process';
import type { FaultPointArm } from './types';

export interface CrashHarnessOptions {
  readonly entry: string;
  readonly env: Readonly<Record<string, string>>;

  // the one clock's time when the test starts, in ms since the epoch
  readonly startMs: number;
}

export interface AdvanceOptions {
  // waits for every runner and renewal that the advance woke to sleep again, so the test knows
  // each of them looked at the new time; a step the advance started makes the advance throw
  readonly settle?: boolean;

  // how long each nixie waits for its woken sleepers before the advance throws; nixie's default
  // when left out
  readonly settleTimeoutMs?: number;
}

export interface CrashHarness {
  // the one clock's time, which every nixie process the harness starts reads
  readonly now: () => number;

  // starts a nixie process on the clock's time; await its ready before driving it
  readonly start: (faultPoints?: readonly FaultPointArm[]) => NixieProcess;

  // moves the clock forward in the test and in every nixie process still running; it refuses while
  // a nixie it started is not yet ready, because that nixie's clock would fall behind
  readonly advance: (ms: number, options?: AdvanceOptions) => Promise<void>;

  // kills every nixie process still running
  readonly stop: () => Promise<void>;
}

// Starts the crash harness: it runs nixie as child processes on one clock that the test sets and
// advances, and kills every process still running when the test finishes.
export function startCrashHarness(options: CrashHarnessOptions): CrashHarness {
  const clock = { now: options.startMs };
  const processes: TrackedProcesses = { started: new Set(), running: new Set() };

  const stop = async (): Promise<void> => {
    await Promise.all([...processes.started].map((nixie) => nixie.kill()));
  };

  onTestFinished(stop);

  return {
    now: () => clock.now,
    start: (faultPoints = []) => {
      const nixie = startNixieProcess({
        entry: options.entry,
        env: options.env,
        clockMs: clock.now,
        faultPoints,
      });

      void updateTracked(processes, nixie);

      return nixie;
    },
    advance: async (ms, advanceOptions = {}) => {
      if (processes.started.size > processes.running.size) {
        throw new Error('a nixie is not ready yet, so it would miss the advance');
      }

      clock.now += ms;

      const replies = await Promise.all(
        [...processes.running].map((nixie) =>
          nixie.request('advance', {
            ms,
            settle: advanceOptions.settle ?? false,
            settleTimeoutMs: advanceOptions.settleTimeoutMs,
          }),
        ),
      );

      if (advanceOptions.settle === true && !replies.every((reply) => isSettled(reply))) {
        throw new Error('a runner the advance woke did not sleep again');
      }
    },
    stop,
  };
}

interface TrackedProcesses {
  readonly started: Set<NixieProcess>;

  // a process gets the clock's advances once it is ready, and until it exits
  readonly running: Set<NixieProcess>;
}

async function updateTracked(processes: TrackedProcesses, nixie: NixieProcess): Promise<void> {
  processes.started.add(nixie);

  try {
    await nixie.ready;

    processes.running.add(nixie);
  } catch {
    // a nixie that exits before it is ready never gets an advance
  }

  await nixie.exited;

  processes.started.delete(nixie);
  processes.running.delete(nixie);
}

function isSettled(reply: unknown): boolean {
  return (
    typeof reply === 'object' && reply !== null && 'settled' in reply && reply.settled === true
  );
}
