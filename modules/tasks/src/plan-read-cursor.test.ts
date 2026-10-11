import { expect, test } from 'bun:test';
import { planReadCursor } from './plan-read-cursor';

test.each([
  [[11, 14, 20], [11, 14, 20], 20],
  [[11, 14, 20], [], 7],
  [[11, 14, 20], [11, 20], 11],
  [[11, 14, 20], [20], 7],
  [[], [], 7],
  [[11, 14], [11, 12], 11],
])(
  'it moves the cursor from 7 over unread %p with %p acknowledged to %p',
  (unread, acknowledged, expected) => {
    expect(planReadCursor(unread, 7, acknowledged)).toBe(expected);
  },
);
