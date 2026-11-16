import type { RecordInput } from '@heynixie/log';
import type { TasksContext } from '@heynixie/tasks';
import type { Attempt } from './leased-records';
import { buildOutcomeRecord } from './leased-records';
import type { AttemptStep } from './pick-attempt-step';

// The records of an attempt the policy check stopped: a deny fails the action, and an ask holds it
// behind the proposal that opens the owner's question.
export function buildRefusalRecords(
  context: Pick<TasksContext, 'definitions'>,
  attempt: Pick<Attempt, 'action' | 'attempt'>,
  step: Exclude<AttemptStep, { readonly kind: 'go' }>,
): readonly RecordInput[] {
  if (step.kind === 'deny') {
    return [
      buildOutcomeRecord(context, attempt, {
        outcome: { status: 'failed', reason: 'rule_denied' },
        details: { message: step.verdict.message },
        rule: step.verdict.rule,
      }),
    ];
  }

  return [
    step.verdict.record,
    {
      kind: 'action.held',
      definitions: context.definitions(),
      thread: attempt.action.task_id,
      payload: { actionID: attempt.action.action_id, proposalID: step.verdict.proposalID },
    },
  ];
}
