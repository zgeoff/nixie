export interface SessionGuard {
  readonly withTurn: <T>(run: (signal: AbortSignal) => Promise<T>) => Promise<T>;

  readonly withInvalidation: (cleanup: () => Promise<void>) => Promise<void>;
}

interface CleanupGate {
  current: Promise<void>;
  pending: number;
}

export function makeSessionGuard(): SessionGuard {
  const gate: CleanupGate = { current: Promise.resolve(), pending: 0 };

  const active = new Map<AbortController, Promise<void>>();

  return {
    withTurn: async (run) => {
      while (gate.pending > 0) {
        await gate.current;
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
      const ran = runAfter([gate.current, ...active.values()], cleanup);

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
  try {
    await cleanup;
  } catch {
    // The cleanup's own caller awaits the same promise and handles its failure.
  } finally {
    gate.pending -= 1;
  }
}
