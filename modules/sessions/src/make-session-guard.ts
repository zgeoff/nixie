// Keeps the conversation's turns and the cleanups a forget makes apart. Turns may overlap, and each
// cleanup runs alone.
export interface SessionGuard {
  // runs one turn once every cleanup asked for before it is done, with a signal that aborts when a
  // forget invalidates the session the turn runs on
  readonly withTurn: <T>(run: (signal: AbortSignal) => Promise<T>) => Promise<T>;

  // aborts every running turn, then runs the cleanup once those turns and the cleanups before it
  // have ended; no turn starts until the cleanup is done
  readonly withInvalidation: (cleanup: () => Promise<void>) => Promise<void>;
}

// the latest cleanup, which every turn that starts waits for, and how many cleanups are not done
interface CleanupGate {
  current: Promise<void>;
  pending: number;
}

// Makes the guard between the conversation's turns and a forget's session cleanup. A cleanup never
// removes a transcript a live CLI writes, and turns never wait for each other, so a runner that
// took over an expired lease never waits on the turn a stale runner still holds.
export function makeSessionGuard(): SessionGuard {
  const gate: CleanupGate = { current: Promise.resolve(), pending: 0 };

  const active = new Map<AbortController, Promise<void>>();

  return {
    withTurn: async (run) => {
      // nothing awaits between the last check and the turn's registration, so every cleanup
      // asked for later sees and aborts this turn
      while (gate.pending > 0) {
        // oxlint-disable-next-line no-await-in-loop -- each wait follows the cleanup asked for during the last
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

// Waits for a cleanup, then counts it done. A failed cleanup leaves the forget pending for the store
// to run again, and lets turns on.
// oxlint-disable-next-line typescript/prefer-readonly-parameter-types -- the gate's count changes as each cleanup ends
async function waitForCleanup(gate: CleanupGate, cleanup: Promise<void>): Promise<void> {
  try {
    await cleanup;
  } catch {
    // the cleanup's caller handles the failure
  } finally {
    gate.pending -= 1;
  }
}
