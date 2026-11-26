import { expect, test } from 'bun:test';
import { pickSandboxLimit } from './pick-sandbox-limit';

test.each([
  { startMicros: 0, leftDollars: 2, dollars: 2 },
  { startMicros: 500_000, leftDollars: 1.5, dollars: 2 },
  { startMicros: 500_000, leftDollars: 0, dollars: 0.5 },
  { startMicros: 500_000, leftDollars: -0.3, dollars: 0.5 },
  { startMicros: 0, leftDollars: 0.0000019, dollars: 0.000001 },
])(
  'it limits a sandbox at $dollars for a count of $startMicros micros and $leftDollars left',
  (row) => {
    const limit = pickSandboxLimit({ startMicros: row.startMicros, leftDollars: row.leftDollars });

    expect(limit).toStrictEqual({ dollars: row.dollars });
  },
);
