import type { RunStep, TaskClaim, TasksContext } from '@heynixie/tasks';
import { buildStepRunID } from '@heynixie/tasks';
import type { ActionOutcome, ActionQueue } from '@heynixie/tools';
import { buildActionHash } from './build-action-hash';
import { createAllowedAction } from './create-allowed-action';
import type { ModelView } from './types';
import { waitForActionOutcome } from './wait-for-action-outcome';

export interface ActionQueueBridge {
  readonly queue: ActionQueue;

  readonly trackSteps: (runStep: RunStep) => RunStep;
}

export function buildActionQueue(context: TasksContext): ActionQueueBridge {
  const steps = new Map<string, TaskClaim>();

  return {
    queue: {
      enqueue: async (action) => {
        const step = steps.get(action.run.thread);

        if (step === undefined) {
          throw new Error(`no step of ${action.run.thread} runs, so its call queues nothing`);
        }

        if (action.run.stepRunID !== buildStepRunID(step)) {
          throw new Error(
            `the call comes from no step that holds ${action.run.thread}'s claim, so it queues nothing`,
          );
        }

        const queued = await createAllowedAction(context, {
          step,
          tool: action.call.tool,
          actionHash: buildActionHash(action.call.tool, action.call.input),
          arguments: action.call.input,
          decision: action.decision,
        });

        return queued.actionID;
      },
      waitForOutcome: async (actionID, timeoutMs) => {
        const view = await waitForActionOutcome(context, actionID, { timeoutMs });

        return toActionOutcome(view);
      },
    },
    trackSteps: (runStep) => async (input) => {
      const step: TaskClaim = { lease: input.lease, stepKey: input.stepKey, wake: input.wake };

      steps.set(input.taskID, step);

      try {
        return await runStep(input);
      } finally {
        if (steps.get(input.taskID) === step) {
          steps.delete(input.taskID);
        }
      }
    },
  };
}

function toActionOutcome(view: ModelView): ActionOutcome | null {
  if (view.status === 'done') {
    return view.result === null ? null : { outcome: 'done', result: view.result };
  }

  if (view.status === 'failed') {
    return { outcome: 'failed', reason: view.reason };
  }

  return view.status === 'unknown' ? { outcome: 'unknown', reason: view.message } : null;
}
