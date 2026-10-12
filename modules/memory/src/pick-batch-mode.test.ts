import { expect, test } from 'bun:test';
import { pickBatchMode } from './pick-batch-mode';

test.each([
  [3, 'catch_up'],
  [7, 'catch_up'],
  [8, 'live'],
  [12, 'live'],
] as const)(
  'it picks for a batch starting at %d with memory started at 8 the %s mode',
  (start, mode) => {
    expect(pickBatchMode({ start_sequence: 8 }, { start, end: start + 4 })).toBe(mode);
  },
);
