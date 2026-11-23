import type { RunningStep } from '@heynixie/tasks';

export interface SessionGuard {
  // step: the step whose turn this is, which a later cleanup waits for until it commits
  readonly withTurn: <T>(
    run: (signal: AbortSignal) => Promise<T>,
    step?: RunningStep,
  ) => Promise<T>;

  // lastStep: the step of the last turn that started, whose commit can still be on its way
  readonly withInvalidation: (
    cleanup: (lastStep: RunningStep | undefined) => Promise<void>,
  ) => Promise<void>;
}

interface CleanupGate {
  current: Promise<void>;
  pending: number;
}

export function makeSessionGuard(): SessionGuard {
  const gate: CleanupGate = { current: Promise.resolve(), pending: 0 };

  const active = new Map<AbortController, Promise<void>>();

  const turns: { last?: RunningStep } = {};

  return {
    withTurn: async (run, step) => {
      while (gate.pending > 0) {
        await gate.current;
      }

      if (step !== undefined) {
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
      const ran = runAfter([gate.current, ...active.values()], () => cleanup(turns.last));

      for (const controller of active.keys()) {
        controller.abort(new Error('a forget invalidated the session'));
      }

      gate.pending += 1;
      gate.current = waitForCleanup(gate, ran);

      return ran;
    },
  };
}

async function runAfter(
  before: readonly Promise<void>[],
  cleanup: () => Promise<void>,
): Promise<void> {
  await Promise.all(before);

  await cleanup();
}

async function waitForCleanup(gate: CleanupGate, cleanup: Promise<void>): Promise<void> {
  await cleanup.catch(() => {});

  gate.pending -= 1;
}
