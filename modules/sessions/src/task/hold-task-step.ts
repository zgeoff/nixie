import type { Clock } from '@heynixie/clock';
import type { StepInput, StepResult } from '@heynixie/tasks';

// How long a step that the gateway did not answer waits before its task is claimed again.
const gatewayRetryMs = 5000;

// The step runs no turn and commits nothing, and its task is claimed again after the wait.
export async function holdTaskStep(clock: Clock, input: StepInput): Promise<StepResult> {
  await clock.sleep(gatewayRetryMs, input.signal).catch(() => {});

  return {
    next: 'continue',
    records: [],
    acknowledged: [],
    sessionBoundary: input.sessionBoundary,
    isHeld: true,
  };
}
