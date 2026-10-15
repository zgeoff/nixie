import { isCompactionDue, removeSummaryKeys } from '@heynixie/compaction';
import type { StepResult } from '@heynixie/tasks';
import type { SessionPoint } from '@heynixie/wire';
import { parseSessionBoundary } from './parse-session-boundary';
import { readCurrentInbox } from './read-current-inbox';
import { readSessionTurn } from './read-session-turn';
import { runOpenedTurn } from './run-opened-turn';
import { runResumedTurn } from './run-resumed-turn';
import type { ConversationRun, InboxPlan, SessionStart, SessionStep } from './types';

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
  const boundary = parseSessionBoundary(step.input.sessionBoundary);

  if (boundary !== null && !step.marks.isInvalidated && step.marks.hasOpening) {
    return runResumedTurn(step, { boundary, plan });
  }

  const start = pickSessionStart(step.marks, boundary);

  // a summary that committed while a forget's cleanup ran kept its key, so the opening erases it
  if (start.kind === 'rebuild' && start.reason === 'forget') {
    await removeSummaryKeys(step.run.context.log, step.input.taskID);
  }

  const opened = await readSessionTurn(step, true);

  const source = { definitions: step.run.context.definitions, model: step.run.model };

  return runOpenedTurn(opened, { source, start, before: plan.before });
}

// A session from before opening records holds the pinned core only in an old system prompt, so it
// opens again as a rebuild in place of a lost one.
function pickSessionStart(
  marks: SessionStep['marks'],
  boundary: SessionPoint | null,
): SessionStart {
  const lostSessionID = boundary?.sessionID ?? null;

  if (marks.isInvalidated) {
    return { kind: 'rebuild', reason: 'forget', lostSessionID };
  }

  if (boundary === null) {
    return marks.isSummarized ? { kind: 'compaction' } : { kind: 'first' };
  }

  return { kind: 'rebuild', reason: 'lost', lostSessionID };
}

// whether the turn the result commits ended with its context past the threshold
function isResultPastThreshold(run: ConversationRun, result: StepResult): boolean {
  const ended = result.records.find((record) => record.kind === 'model.turn_ended');
  const size = ended?.payload?.['contextSize'];
  const window = ended?.payload?.['contextWindow'];

  return (
    typeof size === 'number' &&
    typeof window === 'number' &&
    isCompactionDue({ size, window }, run.compaction.threshold)
  );
}
