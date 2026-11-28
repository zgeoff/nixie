import { expect, test } from 'bun:test';
import { pickRowAttention } from './pick-row-attention';

test.each([
  { title: 'a working connection', binding: 'enabled', status: 'active', expected: null },
  { title: 'a failing connection', binding: 'enabled', status: 'failing', expected: 'failing' },
  {
    title: 'a disabled connection',
    binding: 'disabled',
    status: 'active',
    expected: 'disconnected',
  },
  { title: 'a connection under Forget', binding: 'removing', status: 'forgotten', expected: null },
])('it picks the status of $title', (row) => {
  expect(
    pickRowAttention(
      { binding: row.binding, status: row.status, refresh_expires_at: null },
      1_795_078_800_000,
    ),
  ).toBe(row.expected);
});
