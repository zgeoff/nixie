import type { ErasureEffects, ErasureFaultPoint } from '../erasure/erasure-effects';

export interface TestErasureEffects {
  readonly effects: ErasureEffects;

  // each effect call, in order, as text such as `cleanupSessions {"noteID":"a"}`
  readonly calls: string[];

  // makes the next arrival at this fault point throw, as a crash there would end the step
  readonly crashAt: (point: ErasureFaultPoint) => void;
}

// Effects that touch nothing and record each call, for a test of the runner or of a store that
// runs on it.
export function buildTestErasureEffects(): TestErasureEffects {
  const calls: string[] = [];

  const armed = new Set<ErasureFaultPoint>();

  const effects: ErasureEffects = {
    closeCaptures: () => {
      calls.push('closeCaptures');

      return Promise.resolve();
    },
    holdCaptures: (erasureID) => {
      calls.push(`holdCaptures ${erasureID}`);
    },
    releaseCaptures: (erasureID) => {
      calls.push(`releaseCaptures ${erasureID}`);
    },
    destroySandboxes: (callIDs) => {
      calls.push(`destroySandboxes ${JSON.stringify(callIDs)}`);

      return Promise.resolve();
    },
    cleanupSessions: (cause) => {
      calls.push(`cleanupSessions ${JSON.stringify(cause)}`);

      return Promise.resolve();
    },
    readCleanedThreads: () => Promise.resolve([]),
    finishPurges: (recordSequence) => {
      calls.push(`finishPurges ${String(recordSequence)}`);

      return Promise.resolve();
    },
    removeTurnInputs: (scope) => {
      calls.push(`removeTurnInputs ${JSON.stringify(scope)}`);

      return Promise.resolve();
    },
    writeBackupFloor: () => {
      calls.push('writeBackupFloor');

      return Promise.resolve();
    },
    reachFaultPoint: (point) => {
      if (armed.delete(point)) {
        return Promise.reject(new Error(`crash at ${point}`));
      }

      return Promise.resolve();
    },
  };

  return {
    effects,
    calls,
    crashAt: (point) => {
      armed.add(point);
    },
  };
}
