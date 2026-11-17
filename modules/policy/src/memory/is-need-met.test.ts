import { expect, test } from 'bun:test';
import type { RuleCheck } from '../types';
import type { RuleNeed } from './is-need-met';
import { isNeedMet } from './is-need-met';

test.each<[string, readonly RuleCheck[], RuleNeed, boolean]>([
  ['returns true for a rule with no check and the none need', [], 'none', true],
  ['returns false for a rule with no check and the self-note need', [], 'self_note', false],
  ['returns false for a rule with no check and the photo need', [], 'photo', false],
  [
    'returns true for a subject eq self check and the self-note need',
    [{ arg: 'subject', op: 'eq', value: 'self' }],
    'self_note',
    true,
  ],
  [
    'returns false for a subject check for owner and the self-note need',
    [{ arg: 'subject', op: 'eq', value: 'owner' }],
    'self_note',
    false,
  ],
  [
    'returns false for a subject in check and the self-note need',
    [{ arg: 'subject', op: 'in', value: ['self', 'owner'] }],
    'self_note',
    false,
  ],
  [
    'returns true for a check on an image argument and the photo need',
    [{ arg: 'image.eventID', op: 'matches', value: '*' }],
    'photo',
    true,
  ],
  [
    'returns false for a subject check and the photo need',
    [{ arg: 'subject', op: 'eq', value: 'self' }],
    'photo',
    false,
  ],
])('#isNeedMet %s', (_name, checks, need, expected) => {
  expect(isNeedMet({ checks }, need)).toBe(expected);
});
