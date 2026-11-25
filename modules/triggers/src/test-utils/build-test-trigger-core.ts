import type { TasksContext } from '@heynixie/tasks';
import {
  readDefinitionTaskInTransaction,
  withdrawDefinitionTaskInTransaction,
} from '@heynixie/tasks';
import type { TriggerCoreContext } from '../types';

// The trigger core over a tasks context, on the writer's clock, as the server wires it.
export function buildTestTriggerCore(
  context: TasksContext,
  logEvent: TriggerCoreContext['logEvent'] = () => {},
): TriggerCoreContext {
  return {
    log: context.log,
    clock: context.log.writer.clock,
    definitions: context.definitions,
    logEvent,
    readDefinitionTask: readDefinitionTaskInTransaction,
    retireOneShot: (tx, definitionID) =>
      withdrawDefinitionTaskInTransaction(tx, context, definitionID),
  };
}
