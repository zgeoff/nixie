import type { Definitions, Log } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import {
  buildTestDefinitionStore,
  buildTestRunSettings,
  buildTestTaskRunners,
} from '@heynixie/tasks/test-utils';
import type { createFakeClock } from '@zgeoff/testing/clock';
import { makeQueueRunnerActions } from '../action/make-queue-runner-actions';

export interface TestActionsContextDeps {
  // a log whose projections include the tasks and actions ones
  readonly log: Log;
  readonly clock: ReturnType<typeof createFakeClock>;
  readonly definitions: () => Definitions;

  // the store that the test seeds definition tasks into; a fresh one when absent
  readonly definitionStore?: ReturnType<typeof buildTestDefinitionStore>;
}

// The tasks context that the action queue and the action runner take, over a log the test started.
export function buildTestActionsContext(deps: TestActionsContextDeps): TasksContext {
  const definitionStore = deps.definitionStore ?? buildTestDefinitionStore();

  return {
    log: deps.log,
    clock: deps.clock,
    definitions: deps.definitions,
    runSettings: buildTestRunSettings(),
    readDefinitionVersion: definitionStore.readDefinitionVersion,
    readDefinitionRunPolicy: definitionStore.readDefinitionRunPolicy,
    readDefinitionNextFire: definitionStore.readDefinitionNextFire,
    runners: buildTestTaskRunners(),
    queueRunnerActions: makeQueueRunnerActions({
      log: deps.log,
      clock: deps.clock,
      definitions: deps.definitions,
    }),
  };
}
