import { makeRetireOneShot } from '@heynixie/definitions';
import { readDefinitionTaskInTransaction } from '@heynixie/tasks';
import type { TriggerCoreContext } from '@heynixie/triggers';
import type { ServerParts } from '../types';

// What the core of the trigger sources gives each source: where it delivers, and how it reads and
// retires what it woke.
export function buildTriggerCore(parts: ServerParts): TriggerCoreContext {
  return {
    log: parts.context.log,
    clock: parts.context.clock,
    definitions: parts.context.definitions,
    logEvent: parts.log,
    readDefinitionTask: readDefinitionTaskInTransaction,
    retireOneShot: makeRetireOneShot(parts.context),
  };
}
