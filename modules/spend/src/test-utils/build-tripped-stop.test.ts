import { expect, test } from 'bun:test';
import { buildTrippedStop } from './build-tripped-stop';

test('it builds a day trip by turns, and lets a test override a field', () => {
  expect(buildTrippedStop({ limit: 1500 })).toMatchObject({
    state: 'tripped',
    period: 'day',
    measure: 'turns',
    limit: 1500,
  });
});
