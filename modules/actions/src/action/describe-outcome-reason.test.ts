import { expect, test } from 'bun:test';
import type { OutcomeReason } from '../types';
import { describeOutcomeReason, isOutcomeReason } from './describe-outcome-reason';

test.each<[OutcomeReason, string]>([
  ['refused', 'the call was refused'],
  ['refusal_can_clear', 'the call was refused for now'],
  ['retries_exhausted', 'it kept failing and ran out of retries'],
  ['ambiguous', 'its outcome could not be confirmed'],
  ['attempt_without_result', 'it started and never reported a result'],
  ['unknown_tool', 'the tool is not one nixie knows'],
  ['arguments_unreadable', 'its arguments could not be read'],
  ['deadline_passed', 'it passed its deadline'],
  ['rule_denied', 'a rule denied it'],
  ['declined', 'the user declined it'],
  ['lapsed', 'the approval lapsed before it was answered'],
  ['destinations_changed', 'the places it would reach changed after the approval'],
  ['dropped', 'the user dropped it'],
])('#describeOutcomeReason gives a sentence for %s', (reason, sentence) => {
  expect(describeOutcomeReason(reason)).toBe(sentence);
});

test('#isOutcomeReason accepts a reason this release describes', () => {
  expect(isOutcomeReason('rule_denied')).toBe(true);
});

test('#isOutcomeReason refuses a reason from a later release and a value that is not a string', () => {
  expect(isOutcomeReason('a_later_reason')).toBe(false);
  expect(isOutcomeReason(null)).toBe(false);
});
