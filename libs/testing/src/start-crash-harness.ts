import { onTestFinished } from 'bun:test';
import type { NixieProcess } from './start-nixie-process';
import { startNixieProcess } from './start-nixie-process';
import type { FaultPointArm } from './types';

export interface CrashHarnessOptions {
  readonly entry: string;
  readonly env: Readonly<Record<string, string>>;

  readonly startMs: number;
}

export interface AdvanceOptions {
  readonly settle?: boolean;

  readonly settleTimeoutMs?: number;
}

export interface CrashHarness {
  readonly now: () => number;

  readonly start: (faultPoints?: readonly FaultPointArm[]) => NixieProcess;

  readonly advance: (durationMs: number, options?: AdvanceOptions) => Promise<void>;

  readonly stop: () => Promise<void>;
}

interface TrackedProcesses {
  readonly started: Set<NixieProcess>;

  readonly running: Set<NixieProcess>;
}

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
    advance: async (durationMs, advanceOptions = {}) => {
      if (processes.started.size > processes.running.size) {
        throw new Error('a nixie is not ready yet, so it would miss the advance');
      }

      clock.now += durationMs;

      const replies = await Promise.all(
        [...processes.running].map((nixie) =>
          nixie.request('advance', {
            durationMs,
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

async function updateTracked(processes: TrackedProcesses, nixie: NixieProcess): Promise<void> {
  processes.started.add(nixie);

  try {
    await nixie.ready;

    processes.running.add(nixie);
  } catch {}

  await nixie.exited;

  processes.started.delete(nixie);
  processes.running.delete(nixie);
}

function isSettled(reply: unknown): boolean {
  return (
    typeof reply === 'object' && reply !== null && 'settled' in reply && reply.settled === true
  );
}
