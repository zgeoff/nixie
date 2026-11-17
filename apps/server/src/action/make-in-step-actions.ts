import { probeInStepActionPending, runInStepActions } from '@heynixie/actions';
import type { InStepActions } from '@heynixie/sessions';
import { buildToolRegistry } from '@heynixie/tools';
import type { ServerParts } from '../types';
import { makeAttemptCheck } from './make-attempt-check';

// The approved calls of the tools that run inside the turn run in the step of the task that made
// them. Policy decides each call again, from the stored call and the rules in force then.
export function makeInStepActions(parts: ServerParts): InStepActions {
  const checkAttempt = makeAttemptCheck({
    log: parts.apiContext.log,
    clock: parts.context.clock,
    definitions: parts.apiContext.definitions,
    decisions: parts.decisions,
    registry: buildToolRegistry(parts.tools.definitions),
  });

  return {
    replies: new Map(),
    probePending: (taskID) => probeInStepActionPending(parts.context, taskID),
    run: async (request) => {
      const settled = await runInStepActions(parts.context, request.lease, {
        checkAttempt,
        runCall: request.runCall,
      });

      return settled.map((entry) => ({
        outcomeSequence: entry.outcomeSequence,
        reply: entry.reply,
      }));
    },
  };
}
