import type { OutcomeReason } from '../types';

const reasonSentences: Readonly<Record<OutcomeReason, string>> = {
  refused: 'the service refused it',
  refusal_can_clear: 'the service refused it for now',
  retries_exhausted: 'it kept failing and ran out of retries',
  ambiguous: 'its outcome could not be confirmed',
  attempt_without_result: 'it started and never reported a result',
  unknown_tool: 'the tool is not one nixie knows',
  arguments_unreadable: 'its arguments could not be read',
  deadline_passed: 'it passed its deadline',
  rule_denied: 'a rule denied it',
  declined: 'the owner declined it',
  lapsed: 'the approval lapsed before it was answered',
  destinations_changed: 'the places it would reach changed after the approval',
  dropped: 'the owner dropped it',
};

export function describeOutcomeReason(reason: OutcomeReason): string {
  return reasonSentences[reason];
}
