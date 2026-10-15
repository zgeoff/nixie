import type { StepResult } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import { buildCompactionRequest } from './build-compaction-request';
import { buildStepResult } from './build-step-result';
import { isContextOverflow } from './is-context-overflow';
import { readSessionTurn } from './read-session-turn';
import { runOpenedTurn } from './run-opened-turn';
import { runPlannedTurn } from './run-planned-turn';
import { runSessionCompaction } from './run-session-compaction';
import type { InboxPlan, SessionStep } from './types';

export interface ResumedSession {
  readonly boundary: SessionPoint;
  readonly plan: InboxPlan;
}

// Runs the turn at the session boundary, or on a rebuilt session when the guest lost it, with the
// context read again for the new session. A turn that overflowed the window compacts the session
// from the boundary instead, and the next step runs the turn again on the new session.
export async function runResumedTurn(
  step: SessionStep,
  session: ResumedSession,
): Promise<StepResult> {
  const source = { definitions: step.run.context.definitions, model: step.run.model };

  const turn = await readSessionTurn(step, false);
  const resumed = await runPlannedTurn(turn, { resume: session.boundary });

  const ended = resumed.completed.turn.ended.at(-1);

  if (ended !== undefined && resumed.completed.turn.failure === null && isContextOverflow(ended)) {
    return runOverflowCompaction(step, session, ended.context?.size ?? null);
  }

  if (resumed.completed.turn.failure?.reason === 'session_missing') {
    return runLostTurn(step, session);
  }

  const memory = { ...turn.context, invalidatedThrough: turn.invalidatedThrough };

  return buildStepResult(source, { ...resumed.completed, memory }, session.plan.before);
}

// the guest lost the session, so the turn runs again on a rebuilt one
async function runLostTurn(step: SessionStep, session: ResumedSession): Promise<StepResult> {
  const opened = await readSessionTurn(step, true);

  return runOpenedTurn(opened, {
    source: { definitions: step.run.context.definitions, model: step.run.model },
    start: { kind: 'rebuild', reason: 'lost', lostSessionID: session.boundary.sessionID },
    before: session.plan.before,
  });
}

// The overflowed turn commits nothing, so its inbox stays unread for the turn on the new session.
// A failed compaction fails the step, as the overflow would.
async function runOverflowCompaction(
  step: SessionStep,
  session: ResumedSession,
  contextSize: number | null,
): Promise<StepResult> {
  if (!session.plan.canCompact) {
    throw new Error('the conversation turn passed the context window after a failed compaction');
  }

  const outcome = await runSessionCompaction(
    step.run,
    buildCompactionRequest(step, { resume: session.boundary, trigger: 'overflow', contextSize }),
  );

  if (!outcome.isSummarized) {
    throw new Error('the conversation turn passed the context window, and its compaction failed');
  }

  return {
    next: 'wait',
    records: [...session.plan.before, outcome.record],
    acknowledged: [],
    sessionBoundary: null,
  };
}
