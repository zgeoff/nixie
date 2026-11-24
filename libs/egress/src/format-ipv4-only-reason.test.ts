import { expect, test } from 'bun:test';
import { formatIPv4OnlyReason } from './format-ipv4-only-reason';

test('it names the host and says nixie reaches IPv4 hosts only', () => {
  expect(formatIPv4OnlyReason('maps.test')).toBe(
    'maps.test has no IPv4 address, and nixie reaches IPv4 hosts only',
  );
});
