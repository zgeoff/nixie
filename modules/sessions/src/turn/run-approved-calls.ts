import type { StepInput } from '@heynixie/tasks';
import { buildStepRunID, markBeforeTurnFailure, readInbox } from '@heynixie/tasks';
import type { ApprovedReply, ToolRun, ToolSession, ToolStepHold } from '@heynixie/tools';
import { makeImageReserver } from '../task/make-image-reserver';
import { makeImageRoomReader } from '../task/make-image-room-reader';
import type { ConversationRun } from '../types';

export interface ApprovedCallsPlan {
  // the session the calls run on
  readonly session: ToolSession;

  // the turn's signal, which a forget aborts, so a worker stays inside the turn's bounds
  readonly signal: AbortSignal;
}

// A call runs under the step's own hold on the turn's budget and its task run's bounds, as a call
// the model made in the turn would. The inbox is read again, so the turn takes the outcomes.
export async function runApprovedCalls(
  run: ConversationRun,
  input: StepInput,
  plan: ApprovedCallsPlan,
): Promise<StepInput> {
  const actions = run.inStepActions;

  if (actions === undefined || !(await actions.probePending(input.taskID))) {
    return input;
  }

  const images = { spent: { bytes: 0, count: 0 }, budget: run.imageBudget, isCapped: false };

  const token = run.endpoint.startStep(
    buildStepRunID(input),
    {
      ...plan.session,
      reserveImages: makeImageReserver(images),
      readImageRoom: makeImageRoomReader(images),
      step: buildStepHold(run, input, plan.signal),
    },
    buildTaskRun(input),
  );

  try {
    const settled = await actions
      .run({
        lease: input.lease,
        runCall: (request) => run.endpoint.runApproved(token.token, request),
      })
      .catch((error: unknown) => {
        markBeforeTurnFailure(error);
        throw error;
      });

    if (settled.length === 0) {
      return input;
    }

    // an outcome can land behind a message that arrived since the step began, and the read mark
    // moves over a contiguous run of records only, so the turn takes the inbox as it is now
    const inbox = await readInbox(run.context, input.taskID);

    for (const entry of settled) {
      if (entry.reply !== null) {
        keepReply(actions.replies, entry.outcomeSequence, entry.reply);
      }
    }

    return { ...input, inbox };
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

// The newest replies a turn may still read: a batch that ends before an outcome leaves its reply
// for a later step, so a reply stays past the step that ran its call.
const keptReplies = 100;

function keepReply(
  replies: Map<number, ApprovedReply>,
  outcomeSequence: number,
  reply: ApprovedReply,
): void {
  replies.set(outcomeSequence, reply);

  for (const sequence of replies.keys()) {
    if (replies.size <= keptReplies) {
      return;
    }

    replies.delete(sequence);
  }
}
