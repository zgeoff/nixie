import { readOpenProposals } from '@heynixie/proposals';
import type { RunStep, TaskClaim, TasksContext } from '@heynixie/tasks';
import { buildStepRunID } from '@heynixie/tasks';
import type { ActionOutcome, ActionQueue } from '@heynixie/tools';
import type { ModelView } from '../types';
import { createAllowedAction } from './create-allowed-action';
import { readOpenRepeat } from './read-open-repeat';
import { waitForActionOutcome } from './wait-for-action-outcome';

export interface ActionQueueBridge {
  readonly queue: ActionQueue;

  readonly trackSteps: (runStep: RunStep) => RunStep;
}

export interface ActionQueueOptions {
  readonly ownerName: string | null;
}

export function buildActionQueue(
  context: TasksContext,
  options?: ActionQueueOptions,
): ActionQueueBridge {
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
          actionHash: action.actionHash,
          arguments: action.call.input,
          decision: action.decision,
          callSequence: action.callSequence,
          deadlineAt: action.deadlineAt,
          effects: action.effects,
          destinations: action.destinations ?? [],
          content: action.content ?? [],
        });

        return 'shortID' in queued
          ? { status: 'asked', shortID: queued.shortID }
          : { status: 'queued', actionID: queued.actionID };
      },
      readOpenRepeat: (query) =>
        readOpenRepeat(context.log.writer.db, {
          taskID: query.run.thread,
          tool: query.tool,
          arguments: query.input,
          actionHash: query.actionHash,
        }),
      readOpenAsk: async (tx, query) => {
        const repeat = await readOpenRepeat(tx, {
          taskID: query.run.thread,
          tool: query.tool,
          arguments: query.input,
          actionHash: query.actionHash,
        });

        if (repeat !== null) {
          return { kind: 'action', repeat };
        }

        const open = await readOpenProposals(tx, context.clock.now());

        const proposal = open.find(
          (row) =>
            row.family === 'action' &&
            row.thread === query.run.thread &&
            row.actionHash === query.actionHash,
        );

        return proposal === undefined ? null : { kind: 'proposal', shortID: proposal.shortID };
      },
      waitForOutcome: async (actionID, timeoutMs) => {
        const view = await waitForActionOutcome(context, actionID, {
          timeoutMs,
          ownerName: options?.ownerName ?? null,
        });

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
    return view.result === null
      ? null
      : {
          outcome: 'done',
          result: view.result,
          ...(view.images === undefined ? {} : { images: view.images }),
        };
  }

  if (view.status === 'failed') {
    return { outcome: 'failed', reason: view.reason };
  }

  if (view.status === 'cancelled') {
    return { outcome: 'cancelled', reason: view.message };
  }

  return view.status === 'unknown' ? { outcome: 'unknown', reason: view.message } : null;
}
