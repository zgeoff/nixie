import { expect, test } from 'bun:test';
import { isOverflowReason } from './is-overflow-reason';

test.each(['blocking_limit', 'prompt_too_long'])(
  'it counts the terminal reason %s as an overflow',
  (reason) => {
    expect(isOverflowReason(reason)).toBeTrue();
  },
);

test.each(['completed', 'max_turns', undefined])(
  'it does not count the terminal reason %s as an overflow',
  (reason) => {
    expect(isOverflowReason(reason)).toBeFalse();
  },
);
