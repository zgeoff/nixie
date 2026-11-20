import type { StepResult } from '@heynixie/tasks';
import type { StepTurn } from '../step/build-step-result';
import type { SessionStep } from '../types';
import { voidFailedAttempt } from './run-live-turn';

// A turn can finish and still fail its step, such as one the model API refused. The step then keeps
// none of the replies the turn wrote live.
export async function runStepCommit(
  step: Pick<SessionStep, 'run' | 'input'>,
  completed: Pick<StepTurn, 'turn'>,
  build: () => StepResult,
): Promise<StepResult> {
  try {
    return build();
  } catch (error) {
    await voidFailedAttempt(step.run, step.input, completed.turn.written, error);

    throw error;
  }
}
