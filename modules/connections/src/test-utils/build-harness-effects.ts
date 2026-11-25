import type { ErasureEffects, ErasureFaultPoint } from '@heynixie/log';

export interface HarnessEffects {
  readonly effects: ErasureEffects;

  // each session cleanup the runner ran, as the cause it passed
  readonly cleanedCauses: unknown[];

  // the erasure IDs that held and released capture
  readonly holds: string[];

  // makes the next arrival at this fault point throw, as a crash there would end the step
  readonly crashAt: (point: ErasureFaultPoint) => void;
}

// Erasure effects that touch nothing. A forget of a connection reaches no sandbox, no turn input and
// no capture, so a test sees the session cleanup and the fault points alone.
export function buildHarnessEffects(): HarnessEffects {
  const armed = new Set<ErasureFaultPoint>();

  const cleanedCauses: unknown[] = [];
  const holds: string[] = [];

  return {
    cleanedCauses,
    holds,
    crashAt: (point) => {
      armed.add(point);
    },
    effects: {
      closeCaptures: () => Promise.resolve(),
      holdCaptures: (erasureID) => {
        holds.push(`hold ${erasureID}`);
      },
      releaseCaptures: (erasureID) => {
        holds.push(`release ${erasureID}`);
      },
      destroySandboxes: () => Promise.resolve(),
      cleanupSessions: (cause) => {
        cleanedCauses.push(cause);

        return Promise.resolve();
      },
      readCleanedThreads: () => Promise.resolve([]),
      finishPurges: () => Promise.resolve(),
      removeTurnInputs: () => Promise.resolve(),
      writeBackupFloor: () => Promise.resolve(),
      reachFaultPoint: (point) =>
        armed.delete(point) ? Promise.reject(new Error(`crash at ${point}`)) : Promise.resolve(),
    },
  };
}
