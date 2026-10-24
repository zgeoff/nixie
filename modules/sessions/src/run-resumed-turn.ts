import type { StepResult } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import { buildStepResult } from './build-step-result';
import { isContextOverflow } from './is-context-overflow';
import { probeSessionImagesFull } from './probe-session-images-full';
import { readSessionTurn } from './read-session-turn';
import { runOpenedTurn } from './run-opened-turn';
import { runOverflowCompaction } from './run-overflow-compaction';
import { runPlannedTurn } from './run-planned-turn';
import type { InboxPlan, SessionStep } from './types';

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
): Promise<StepResult> {
  const opened = await readSessionTurn(step, true);

  return runOpenedTurn(opened, {
    source: { definitions: step.run.context.definitions, model: step.run.model },
    start: { kind: 'rebuild', reason, lostSessionID: session.boundary.sessionID },
    before: session.plan.before,
  });
}

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
