import type { ErasureEffects, ErasureFaultPoint } from '@heynixie/log';
import { pickForgottenInputs } from '@heynixie/turn-inputs';

export interface HarnessEffects {
  readonly effects: ErasureEffects;

  // each session cleanup the runner ran, as the cause it passed
  readonly cleanedCauses: unknown[];

  // the erasure IDs that held and released capture
  readonly holds: string[];

  // puts a logged request of a thread in the list that a forget's turn-input removal reads
  readonly seedInput: (taskID: string, intakeSequence: number) => void;

  // the logged requests that no forget removed, as thread and intake sequence
  readonly readInputs: () => readonly (readonly [string, number])[];

  // makes the next arrival at this fault point throw, as a crash there would end the step
  readonly crashAt: (point: ErasureFaultPoint) => void;
}

// Erasure effects that touch no sandbox and no capture. The turn-input removal drops the seeded
// requests that the real selector picks for the forget's scope.
export function buildHarnessEffects(): HarnessEffects {
  const armed = new Set<ErasureFaultPoint>();

  const cleanedCauses: unknown[] = [];
  const holds: string[] = [];
  let inputs: { task_id: string; intake_sequence: number }[] = [];

  return {
    cleanedCauses,
    holds,
    seedInput: (taskID, intakeSequence) => {
      inputs.push({ task_id: taskID, intake_sequence: intakeSequence });
    },
    readInputs: () => inputs.map((input) => [input.task_id, input.intake_sequence]),
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
      removeTurnInputs: (scope) => {
        const removed = new Set(pickForgottenInputs(inputs, scope));

        inputs = inputs.filter((input) => !removed.has(input));

        return Promise.resolve();
      },
      writeBackupFloor: () => Promise.resolve(),
      reachFaultPoint: (point) =>
        armed.delete(point) ? Promise.reject(new Error(`crash at ${point}`)) : Promise.resolve(),
    },
  };
}
