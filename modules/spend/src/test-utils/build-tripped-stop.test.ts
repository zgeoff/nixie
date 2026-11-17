import { expect, test } from 'bun:test';
import { buildTrippedStop } from './build-tripped-stop';

test('it builds a day trip by dollars, and lets a test override a field', () => {
  expect(buildTrippedStop({ measure: 'turns' })).toMatchObject({
    state: 'tripped',
    period: 'day',
    measure: 'turns',
    limit: 60,
  });
});
