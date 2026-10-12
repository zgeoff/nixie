import type { StepInput, StepResult } from '@heynixie/tasks';
import { buildStepResult } from './build-step-result';
import { inboxBatchLimit } from './inbox-batch-limit';
import { parseSessionBoundary } from './parse-session-boundary';
import { readSessionMarks } from './read-session-marks';
import { readTurnContext } from './read-turn-context';
import type { SessionTurn } from './run-planned-turn';
import { runPlannedTurn } from './run-planned-turn';
import { runRebuiltTurn } from './run-rebuilt-turn';
import type { ConversationRun } from './types';

// Runs one turn step of the conversation, with the pinned core in its system prompt and the
// retrieved items before your message, resumed at the session boundary on a fork. A session that a
// forget invalidated or the guest lost is rebuilt from the log.
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
  const turn: SessionTurn = {
    run,
    input,
    signal,
    invalidatedThrough: marks.invalidatedThrough,
    context: await readTurnContext(run, {
      taskID: input.taskID,
      batch: input.inbox.slice(0, inboxBatchLimit),
      previousCore: marks.previousCore,
    }),
  };

  if (marks.isInvalidated || boundary === null) {
    return runRebuiltTurn(turn, source, boundary && { reason: 'invalidated', lost: boundary });
  }
  const resumed = await runPlannedTurn(turn, boundary);

  if (resumed.completed.turn.failure?.reason !== 'session_missing') {
    return buildStepResult(
      source,
      {
        ...resumed.completed,
        memory: { ...turn.context, invalidatedThrough: turn.invalidatedThrough },
      },
      [],
    );
  }
  return runRebuiltTurn(turn, source, { reason: 'missing', lost: boundary });
}
