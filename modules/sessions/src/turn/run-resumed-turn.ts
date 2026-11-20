import type { RecordInput } from '@heynixie/log';
import type { StepResult } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import { runOverflowCompaction } from '../compaction/run-overflow-compaction';
import { probeSessionImagesFull } from '../session/probe-session-images-full';
import { readSessionTurn } from '../session/read-session-turn';
import type { CompletedTurn } from '../step/build-step-result';
import { buildStepResult } from '../step/build-step-result';
import type { InboxPlan, SessionStart, SessionStep } from '../types';
import type { DroppedReplies } from '../utils/build-reply-voids';
import { buildReplyVoids } from '../utils/build-reply-voids';
import { isContextOverflow } from '../utils/is-context-overflow';
import { runOpenedTurn } from './run-opened-turn';
import { runPlannedTurn } from './run-planned-turn';
import { runStepCommit } from './run-step-commit';

export interface ResumedSession {
  readonly boundary: SessionPoint;
  readonly plan: InboxPlan;
}

export async function runResumedTurn(
  step: SessionStep,
  session: ResumedSession,
): Promise<StepResult> {
  const isFull = await probeSessionImagesFull(step.run, {
    inbox: step.input.inbox,
    wake: step.input.wake,
    images: step.marks.images,
  });

  return isFull ? runRebuiltTurn(step, session, 'images') : runBoundaryTurn(step, session);
}

async function runRebuiltTurn(
  step: SessionStep,
  session: ResumedSession,
  reason: 'lost' | 'images',
  dropped: readonly RecordInput[] = [],
): Promise<StepResult> {
  const start: SessionStart = {
    kind: 'rebuild',
    reason,
    lostSessionID: step.run.harness.session?.nameSession(session.boundary) ?? null,
  };

  const opened = await readSessionTurn(step, start);

  return runOpenedTurn(opened, {
    source: { definitions: step.run.context.definitions, model: step.run.model },
    start,
    before: [...session.plan.before, ...dropped],
  });
}

async function runBoundaryTurn(step: SessionStep, session: ResumedSession): Promise<StepResult> {
  const source = { definitions: step.run.context.definitions, model: step.run.model };

  const turn = await readSessionTurn(step, null);
  const resumed = await runPlannedTurn(turn, { resume: session.boundary });

  const ended = resumed.completed.turn.ended.at(-1);

  // A harness without summarize cannot compact, so an overflowed turn falls through and fails the
  // step.
  if (
    ended !== undefined &&
    resumed.completed.turn.failure === null &&
    isContextOverflow(ended) &&
    step.run.harness.capabilities.has('summarize')
  ) {
    return runOverflowCompaction(step, {
      plan: session.plan,
      resume: session.boundary,
      contextSize: ended.context?.size ?? null,
      replies: buildDroppedReplies(resumed.completed),
    });
  }

  if (resumed.completed.turn.failure?.reason === 'session_missing') {
    return runRebuiltTurn(
      step,
      session,
      'lost',
      buildReplyVoids(source, {
        ...buildDroppedReplies(resumed.completed),
        reason: 'turn_dropped',
      }),
    );
  }

  const memory = { ...turn.context, invalidatedThrough: turn.invalidatedThrough };
  const completed = { ...resumed.completed, harness: step.run.harness, memory };

  return runStepCommit(step, completed, () =>
    buildStepResult(source, completed, session.plan.before),
  );
}

// The turn ran on a session that no later turn resumes, so none of the replies it wrote stay.
function buildDroppedReplies(completed: CompletedTurn): DroppedReplies {
  return { sequences: completed.turn.written, runID: completed.runID };
}
