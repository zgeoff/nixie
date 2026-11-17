import type { StepInput } from '@heynixie/tasks';
import { buildStepRunID, readInbox } from '@heynixie/tasks';
import type { ApprovedReply, ToolRun, ToolSession, ToolStepHold } from '@heynixie/tools';
import { makeImageReserver } from '../task/make-image-reserver';
import type { ConversationRun } from '../types';

export interface ApprovedCalls {
  // the step's input with the inbox read again, so the turn takes the outcomes that the calls wrote
  readonly input: StepInput;

  // what each call that ran returned, by the sequence of its action's outcome record
  readonly replies: ReadonlyMap<number, ApprovedReply>;
}

export interface ApprovedCallsPlan {
  // the session the calls run on
  readonly session: ToolSession;

  // the turn's signal, which a forget aborts, so a worker stays inside the turn's bounds
  readonly signal: AbortSignal;
}

// The step that holds the task runs the calls its owner approved before its model turn, so one
// turn reads the approval and the results. A call runs under the step's own hold on the turn's
// budget and under its task run's bounds, as a call the model made in the turn would.
export async function runApprovedCalls(
  run: ConversationRun,
  input: StepInput,
  plan: ApprovedCallsPlan,
): Promise<ApprovedCalls> {
  const actions = run.inStepActions;

  if (actions === undefined || !(await actions.probePending(input.taskID))) {
    return { input, replies: new Map() };
  }

  const token = run.endpoint.startStep(
    buildStepRunID(input),
    {
      ...plan.session,
      reserveImages: makeImageReserver({
        spent: { bytes: 0, count: 0 },
        budget: run.imageBudget,
        isCapped: false,
      }),
      step: buildStepHold(run, input, plan.signal),
    },
    buildTaskRun(input),
  );

  try {
    const settled = await actions.run({
      lease: input.lease,
      runCall: (request) => run.endpoint.runApproved(token.token, request),
    });

    if (settled.length === 0) {
      return { input, replies: new Map() };
    }

    // an outcome can land behind a message that arrived since the step began, and the read mark
    // moves over a contiguous run of records only, so the turn takes the inbox as it is now
    const inbox = await readInbox(run.context, input.taskID);

    return {
      input: { ...input, inbox },
      replies: new Map(
        settled.flatMap((entry) =>
          entry.reply === null ? [] : [[entry.outcomeSequence, entry.reply] as const],
        ),
      ),
    };
  } finally {
    await token.stop();
  }
}

export function buildStepHold(
  run: ConversationRun,
  input: StepInput,
  signal: AbortSignal,
): ToolStepHold {
  return {
    signal,
    interrupt: input.interrupt,
    readLeftDollars: () => run.budget?.getLeftDollars() ?? null,
    onSpend: (dollars) => {
      run.budget?.onSpend(dollars);
    },
  };
}

export function buildTaskRun(input: StepInput): ToolRun['taskRun'] {
  return input.run === null
    ? undefined
    : { runID: input.run.runID, calls: input.run.opened.limits.calls };
}
