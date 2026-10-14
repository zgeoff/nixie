import type { StepInput, StepResult } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import { buildStepResult } from './build-step-result';
import { inboxBatchLimit } from './inbox-batch-limit';
import { parseSessionBoundary } from './parse-session-boundary';
import type { SessionMarks } from './read-session-marks';
import { readSessionMarks } from './read-session-marks';
import { readTurnContext } from './read-turn-context';
import { runOpenedTurn } from './run-opened-turn';
import type { SessionTurn } from './run-planned-turn';
import { runPlannedTurn } from './run-planned-turn';
import type { ConversationRun, SessionStart } from './types';

// Runs one turn step of the conversation, with the retrieved items before your message, resumed at
// the session boundary on a fork. A first session, and one that a forget invalidated or the guest
// lost, opens new from the log, with its context read again.
export function runConversationStep(run: ConversationRun, input: StepInput): Promise<StepResult> {
  if (input.inbox.length === 0) {
    return Promise.resolve({
      next: 'wait',
      records: [],
      acknowledged: [],
      sessionBoundary: input.sessionBoundary,
    });
  }
  return run.session.withTurn((invalidated) =>
    runSessionTurn(run, input, AbortSignal.any([input.signal, invalidated])),
  );
}

async function runSessionTurn(
  run: ConversationRun,
  input: StepInput,
  signal: AbortSignal,
): Promise<StepResult> {
  const source = { definitions: run.context.definitions, model: run.model };
  const marks = await readSessionMarks(run.context, input.taskID);
  const boundary = parseSessionBoundary(input.sessionBoundary);
  const step = { run, input, signal, marks };

  if (!marks.isInvalidated && boundary !== null) {
    return runResumedTurn(step, boundary);
  }
  const opened = await readSessionTurn(step, true);
  const start: SessionStart = marks.isInvalidated
    ? { kind: 'rebuild', reason: 'forget', lostSessionID: boundary?.sessionID ?? null }
    : { kind: 'first' };

  return runOpenedTurn(opened, source, start);
}

// Runs the turn at the session boundary, or on a rebuilt session when the guest lost it, with the
// context read again for the new session.
async function runResumedTurn(step: SessionStep, boundary: SessionPoint): Promise<StepResult> {
  const source = { definitions: step.run.context.definitions, model: step.run.model };
  const turn = await readSessionTurn(step, false);
  const resumed = await runPlannedTurn(turn, { resume: boundary });

  if (resumed.completed.turn.failure?.reason !== 'session_missing') {
    const memory = { ...turn.context, invalidatedThrough: turn.invalidatedThrough };

    return buildStepResult(source, { ...resumed.completed, memory }, []);
  }
  const opened = await readSessionTurn(step, true);

  return runOpenedTurn(opened, source, {
    kind: 'rebuild',
    reason: 'lost',
    lostSessionID: boundary.sessionID,
  });
}

interface SessionStep {
  readonly run: ConversationRun;
  readonly input: StepInput;
  readonly signal: AbortSignal;
  readonly marks: SessionMarks;
}

// a new session holds no item yet, so its retrieval leaves none out
async function readSessionTurn(step: SessionStep, isNewSession: boolean): Promise<SessionTurn> {
  const context = await readTurnContext(step.run, {
    taskID: step.input.taskID,
    batch: step.input.inbox.slice(0, inboxBatchLimit),
    previousCore: step.marks.previousCore,
    isNewSession,
    isCompacted: !isNewSession && step.marks.isCompacted,
  });

  return {
    run: step.run,
    input: step.input,
    signal: step.signal,
    invalidatedThrough: step.marks.invalidatedThrough,
    context,
  };
}
