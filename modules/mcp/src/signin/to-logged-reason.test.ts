import { expect, test } from 'bun:test';
import { toLoggedReason } from './to-logged-reason';

test.each([
  {
    title: 'keeps a reason with no query string',
    reason: 'mcp.test resolves to 127.0.0.1, which is not a public address',
    expected: 'mcp.test resolves to 127.0.0.1, which is not a public address',
  },
  {
    title: 'removes the query string of a URL in the reason',
    reason: "Hostname/IP does not match certificate's altnames: URI:https://other.test/?probe=abc",
    expected:
      "Hostname/IP does not match certificate's altnames: URI:https://other.test/?[removed]",
  },
])('#toLoggedReason $title', (row) => {
  expect(toLoggedReason(row.reason)).toBe(row.expected);
});
