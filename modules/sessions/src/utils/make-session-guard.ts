import type { RunningStep } from '@heynixie/tasks';
import { raceStop } from './race-stop';
import { SessionInvalidatedError } from './session-invalidated-error';

export interface SessionGuard {
  // step: the step whose turn this is, which a later cleanup waits for until it commits
  readonly withTurn: <T>(
    run: (signal: AbortSignal) => Promise<T>,
    step?: RunningStep,
  ) => Promise<T>;

  // lastStep: the step of the last turn that started, whose commit can still be on its way
  // stopping: aborts at a shutdown, which ends the cleanup's waits for a turn or a step
  readonly withInvalidation: (
    cleanup: (lastStep: RunningStep | undefined, stopping: AbortSignal) => Promise<void>,
  ) => Promise<void>;
}

interface CleanupGate {
  current: Promise<void>;
  pending: number;
}

// shutdown: aborts when nixie stops. A cleanup then stops waiting for a turn that never ends, and
// rejects, so a stalled turn never holds the shutdown. The next start runs the cleanup again.
export function makeSessionGuard(
  shutdown: AbortSignal = new AbortController().signal,
): SessionGuard {
  const gate: CleanupGate = { current: Promise.resolve(), pending: 0 };

  const active = new Map<AbortController, Promise<void>>();

  const turns: { last?: RunningStep } = {};

  return {
    withTurn: async (run, step) => {
      while (gate.pending > 0) {
        await raceStop(gate.current, shutdown);
      }

      // Lease generations only grow, so a turn of an older claim that starts late must not hide
      // the newer claim, which can still commit a summary.
      if (step !== undefined && step.generation >= (turns.last?.generation ?? 0)) {
        turns.last = step;
      }

      const controller = new AbortController();

      const done = Promise.withResolvers<void>();

      active.set(controller, done.promise);

      try {
        return await run(controller.signal);
      } finally {
        active.delete(controller);
        done.resolve();
      }
    },
    withInvalidation: (cleanup) => {
      const ran = runAfter([gate.current, ...active.values()], shutdown, () =>
        cleanup(turns.last, shutdown),
      );

      for (const controller of active.keys()) {
        controller.abort(new SessionInvalidatedError());
      }

      gate.pending += 1;
      gate.current = waitForCleanup(gate, ran);

      return ran;
    },
  };
}

async function runAfter(
  before: readonly Promise<void>[],
  shutdown: AbortSignal,
  cleanup: () => Promise<void>,
): Promise<void> {
  await raceStop(Promise.all(before), shutdown);
  await cleanup();
}

async function waitForCleanup(gate: CleanupGate, cleanup: Promise<void>): Promise<void> {
  await cleanup.catch(() => {});

  gate.pending -= 1;
}
