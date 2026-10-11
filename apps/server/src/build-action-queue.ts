import type { ModelView } from '@heynixie/actions';
import { createAllowedAction, waitForActionOutcome } from '@heynixie/actions';
import type { RunStep, TaskClaim, TasksContext } from '@heynixie/tasks';
import type { ActionOutcome, ActionQueue } from '@heynixie/tools';
import { buildActionHash } from './build-action-hash';

export interface ActionQueueBridge {
  readonly queue: ActionQueue;

  // wraps the task runners' step, so a queued call that a step's model makes queues under the
  // claim of that step
  readonly trackSteps: (runStep: RunStep) => RunStep;
}

// Builds the action queue that the tool endpoint hands each allowed queued call to. The call
// queues under the claim of the step that runs on the call's thread, with an action hash built
// from its tool and its arguments, so a rerun of a crashed step matches the action it queued.
export function buildActionQueue(context: TasksContext): ActionQueueBridge {
  const steps = new Map<string, TaskClaim>();

  return {
    queue: {
      enqueue: async (action) => {
        const step = steps.get(action.run.thread);

        if (step === undefined) {
          throw new Error(`no step of ${action.run.thread} runs, so its call queues nothing`);
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
      const step: TaskClaim = { lease: input.lease, stepKey: input.stepKey };

      steps.set(input.taskID, step);
      try {
        return await runStep(input);
      } finally {
        // a runner that lost its lease ends after the one that took the task over started
        if (steps.get(input.taskID) === step) {
          steps.delete(input.taskID);
        }
      }
    },
  };
}

// A pending action, and a done action whose result was forgotten, give no outcome inside the turn;
// the outcome reaches the task's inbox either way.
function toActionOutcome(view: ModelView): ActionOutcome | null {
  if (view.status === 'done') {
    return view.result === null ? null : { outcome: 'done', result: view.result };
  }
  if (view.status === 'failed') {
    return { outcome: 'failed', reason: view.reason };
  }
  return view.status === 'unknown' ? { outcome: 'unknown', reason: view.message } : null;
}
