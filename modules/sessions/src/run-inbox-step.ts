import { isCompactionDue, removeSummaryKeys } from '@heynixie/compaction';
import { modelTurnEndedCodec } from '@heynixie/models';
import type { StepResult } from '@heynixie/tasks';
import { isSessionLive } from './is-session-live';
import { pickSessionStart } from './pick-session-start';
import { readCurrentInbox } from './read-current-inbox';
import { readSessionTurn } from './read-session-turn';
import { runOpenedTurn } from './run-opened-turn';
import { runResumedTurn } from './run-resumed-turn';
import type { ConversationRun, InboxPlan, SessionStep } from './types';

// Runs the step's turn on the inbox: resumed at the session boundary on a fork, or on a new session
// for a first session, one after a compaction, and one that a forget invalidated. A turn that ends
// past the threshold asks to continue, so the next step compacts at once.
export async function runInboxStep(step: SessionStep, plan: InboxPlan): Promise<StepResult> {
  const inbox = await readCurrentInbox(step.run.context, step.input.inbox);

  const current = { ...step, input: { ...step.input, inbox } };

  const result = await runSessionTurn(current, plan);

  return plan.canCompact && isResultPastThreshold(step.run, result)
    ? { ...result, next: 'continue' }
    : result;
}

async function runSessionTurn(step: SessionStep, plan: InboxPlan): Promise<StepResult> {
  if (isSessionLive(step.position)) {
    return runResumedTurn(step, { boundary: step.position.boundary, plan });
  }

  const start = pickSessionStart(step.position);

  // a summary that committed while a forget's cleanup ran kept its key, so the opening erases it
  if (start.kind === 'rebuild' && start.reason === 'forget') {
    await removeSummaryKeys(step.run.context.log, step.input.taskID);
  }

  const opened = await readSessionTurn(step, true);

  const source = { definitions: step.run.context.definitions, model: step.run.model };

  return runOpenedTurn(opened, { source, start, before: plan.before });
}

// whether the turn the result commits ended with its context past the threshold
function isResultPastThreshold(run: ConversationRun, result: StepResult): boolean {
  const ended = result.records.find((record) => record.kind === 'model.turn_ended');

  const turn =
    ended?.payload === undefined ? null : modelTurnEndedCodec.tryDecodePartial(ended.payload);

  const size = turn?.contextSize;
  const window = turn?.contextWindow;

  return (
    size !== undefined &&
    window !== undefined &&
    isCompactionDue({ size, window }, run.compaction.threshold)
  );
}
