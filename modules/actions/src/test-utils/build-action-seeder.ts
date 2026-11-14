import type { TasksContext } from '@heynixie/tasks';
import type { AllowedCallSeed } from './build-mock-allowed-call';
import { seedAction } from './seed-action';
import { seedDoneAction } from './seed-done-action';
import { seedFailedAction } from './seed-failed-action';
import { seedPendingRetryScheduledAction } from './seed-pending-retry-scheduled-action';
import { seedUnknownAction } from './seed-unknown-action';

export interface ActionSeederDeps {
  readonly context: TasksContext;
}

export function buildActionSeeder(deps: ActionSeederDeps) {
  return {
    action: (input: AllowedCallSeed) => seedAction(deps.context, input),
    doneAction: (input: AllowedCallSeed) => seedDoneAction(deps.context, input),
    failedAction: (input: AllowedCallSeed) => seedFailedAction(deps.context, input),
    pendingRetryScheduledAction: (input: AllowedCallSeed) =>
      seedPendingRetryScheduledAction(deps.context, input),
    unknownAction: (input: AllowedCallSeed) => seedUnknownAction(deps.context, input),
  };
}
