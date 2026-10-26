import { expect, test } from 'bun:test';
import { buildRunReserveUSD } from './build-run-reserve.ts';

test('it reserves the bound of the costliest call when the run asks for no amount', () => {
  expect(buildRunReserveUSD(null, [0.5, 1.75, 1.25])).toBe(1.75);
});

test('it keeps an asked amount at or above the costliest call', () => {
  expect(buildRunReserveUSD(2, [0.5, 1.75])).toBe(2);
});

test('it refuses an asked amount below the costliest call', () => {
  expect(() => buildRunReserveUSD(0.1, [0.5, 1.75])).toThrow(
    'a reservation of $0.1000 is below $1.7500, the most one call of this run can cost',
  );
});
