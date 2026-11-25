import { expect, test } from 'bun:test';
import { pickConnectionStatus } from './pick-connection-status';

test.each([
  {
    title: 'an active connection',
    binding: 'enabled',
    status: 'active',
    ends: null,
    expected: 'active',
  },
  {
    title: 'a failing connection',
    binding: 'enabled',
    status: 'failing',
    ends: null,
    expected: 'failing',
  },
  {
    title: 'a connection that needs consent',
    binding: 'enabled',
    status: 'needs_consent',
    ends: null,
    expected: 'needs_consent',
  },
  {
    title: 'a connection under Forget',
    binding: 'removing',
    status: 'forgotten',
    ends: null,
    expected: 'forgotten',
  },
  {
    title: 'a forgotten connection',
    binding: 'removed',
    status: 'forgotten',
    ends: null,
    expected: 'forgotten',
  },
  {
    title: 'a grant that ends in 2 days',
    binding: 'enabled',
    status: 'active',
    ends: 1_795_078_800_000 + 172_800_000,
    expected: 'expiring',
  },
  {
    title: 'a grant that ends in 4 days',
    binding: 'enabled',
    status: 'active',
    ends: 1_795_078_800_000 + 345_600_000,
    expected: 'active',
  },
  {
    title: 'a grant that ended',
    binding: 'enabled',
    status: 'active',
    ends: 1_795_078_800_000 - 1,
    expected: 'needs_consent',
  },
  {
    title: 'a failing connection whose grant ends in 2 days',
    binding: 'enabled',
    status: 'failing',
    ends: 1_795_078_800_000 + 172_800_000,
    expected: 'failing',
  },
])('#pickConnectionStatus reads $title as $expected', (row) => {
  const status = pickConnectionStatus({
    binding: row.binding,
    status: row.status,
    refreshExpiresAtMs: row.ends,
    nowMs: 1_795_078_800_000,
  });

  expect(status).toBe(row.expected);
});
