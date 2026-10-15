import type { StepResult } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import { buildStepResult } from './build-step-result';
import { isContextOverflow } from './is-context-overflow';
import { isSessionImagesFull } from './is-session-images-full';
import { readSessionTurn } from './read-session-turn';
import { runOpenedTurn } from './run-opened-turn';
import { runOverflowCompaction } from './run-overflow-compaction';
import { runPlannedTurn } from './run-planned-turn';
import type { InboxPlan, SessionStep } from './types';

export interface ResumedSession {
  readonly boundary: SessionPoint;
  readonly plan: InboxPlan;
}

// Runs the turn at the session boundary, or on a rebuilt session when its images leave no room for
// those of your next message, which every later request would repeat.
export async function runResumedTurn(
  step: SessionStep,
  session: ResumedSession,
): Promise<StepResult> {
  const isFull = await isSessionImagesFull(step.run, {
    inbox: step.input.inbox,
    images: step.marks.images,
  });

  return isFull ? runRebuiltTurn(step, session, 'images') : runBoundaryTurn(step, session);
}

// The turn runs at the boundary, or on a rebuilt session when the guest lost it, with the context
// read again for the new session. A turn that overflowed the window compacts the session from the
// boundary instead, and the next step runs the turn again on the new session.
async function runBoundaryTurn(step: SessionStep, session: ResumedSession): Promise<StepResult> {
  const source = { definitions: step.run.context.definitions, model: step.run.model };

  const turn = await readSessionTurn(step, false);
  const resumed = await runPlannedTurn(turn, { resume: session.boundary });

  const ended = resumed.completed.turn.ended.at(-1);

  if (ended !== undefined && resumed.completed.turn.failure === null && isContextOverflow(ended)) {
    return runOverflowCompaction(step, {
      plan: session.plan,
      resume: session.boundary,
      contextSize: ended.context?.size ?? null,
    });
  }

  if (resumed.completed.turn.failure?.reason === 'session_missing') {
    return runRebuiltTurn(step, session, 'lost');
  }

  const memory = { ...turn.context, invalidatedThrough: turn.invalidatedThrough };

  return buildStepResult(source, { ...resumed.completed, memory }, session.plan.before);
}

// the session cannot take the turn, so the turn runs on a rebuilt one
async function runRebuiltTurn(
  step: SessionStep,
  session: ResumedSession,
  reason: 'lost' | 'images',
): Promise<StepResult> {
  const opened = await readSessionTurn(step, true);

  return runOpenedTurn(opened, {
    source: { definitions: step.run.context.definitions, model: step.run.model },
    start: { kind: 'rebuild', reason, lostSessionID: session.boundary.sessionID },
    before: session.plan.before,
  });
}
