import type { OutcomeReason } from '../types';

const reasonSentences: Readonly<Record<OutcomeReason, string>> = {
  refused: 'the call was refused',
  refusal_can_clear: 'the call was refused for now',
  retries_exhausted: 'it kept failing and ran out of retries',
  ambiguous: 'its outcome could not be confirmed',
  attempt_without_result: 'it started and never reported a result',
  unknown_tool: 'the tool is not one nixie knows',
  arguments_unreadable: 'its arguments could not be read',
  deadline_passed: 'it passed its deadline',
  rule_denied: 'a rule denied it',
  declined: 'the user declined it',
  lapsed: 'the approval lapsed before it was answered',
  destinations_changed: 'the places it would reach changed after the approval',
  dropped: 'the user dropped it',
};

export function describeOutcomeReason(reason: OutcomeReason): string {
  return reasonSentences[reason];
}

// Whether a value read from a record's payload is a reason this release describes. A record from
// a later release can carry a reason this one does not know.
export function isOutcomeReason(value: unknown): value is OutcomeReason {
  return typeof value === 'string' && Object.hasOwn(reasonSentences, value);
}
