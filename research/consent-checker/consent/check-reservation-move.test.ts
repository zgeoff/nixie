import { expect, test } from 'bun:test';
import { checkReservationMove } from './check-reservation-move.ts';

test('it allows a reserved reservation to settle', () => {
  expect(() => checkReservationMove('case 2/3', 'reserved', 'settled')).not.toThrow();
});

test.each([
  ['reserved', 'reserved'],
  ['settled', 'settled'],
  ['settled', 'reserved'],
] as const)('it refuses a reservation that moves from %s to %s', (from, to) => {
  expect(() => checkReservationMove('case 2/3', from, to)).toThrow(
    `the reservation for case 2/3 cannot move from ${from} to ${to}`,
  );
});
