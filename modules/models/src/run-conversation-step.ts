import type { StepInput, StepResult } from '@heynixie/tasks';
import { buildModelRecord } from './build-model-record';
import { buildStepResult } from './build-step-result';
import { parseSessionBoundary } from './parse-session-boundary';
import type { ConversationRun } from './run-live-turn';
import { runLiveTurn } from './run-live-turn';

// Runs one turn step of the conversation in its guest. The turn resumes at the session boundary
// on a fork, and starts a fresh session, with a record of the reset, when the guest has lost it.
export async function runConversationStep(
  run: ConversationRun,
  input: StepInput,
): Promise<StepResult> {
  if (input.inbox.length === 0) {
    return { next: 'wait', records: [], acknowledged: [], sessionBoundary: input.sessionBoundary };
  }
  const source = { definitions: run.context.definitions, model: run.model };
  const resume = parseSessionBoundary(input.sessionBoundary);
  const first = await runLiveTurn(run, input, resume);

  if (first.turn.failure?.reason !== 'session_missing' || resume === null) {
    return buildStepResult(source, first, []);
  }
  const fresh = await runLiveTurn(run, input, null);

  return buildStepResult(source, fresh, [
    buildModelRecord(source, 'model.session_reset', {
      payload: { lostSessionID: resume.sessionID },
    }),
  ]);
}
