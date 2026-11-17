import { expect, test } from 'bun:test';
import { buildSpendStopRow } from './build-spend-stop-row';

test('it builds the row of a day trip, and lets a test override a field', () => {
  expect(buildSpendStopRow({ reason: 'lost' })).toMatchObject({ reason: 'lost', period: 'day' });
});
