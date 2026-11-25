import { expect, test } from 'bun:test';
import { formatConnectionStatus } from './format-connection-status';

test.each([
  ['active', null, 'Active'],
  ['needs_consent', null, 'Needs consent'],
  ['expiring', null, 'Expiring: its grant ends within 3 days'],
  ['forgotten', null, 'Forgotten'],
  ['failing', 'unauthorised', 'Failing: Google refused the token'],
  ['failing', 'service_error', 'Failing: Google answered with an error'],
  ['failing', 'no_answer', 'Failing: Google did not answer'],
  ['failing', null, 'Failing'],
] as const)('#formatConnectionStatus words status %s with reason %s', (status, reason, text) => {
  const formatted = formatConnectionStatus({
    connection: 'k3x9m2p7qa',
    connector: 'google',
    label: 'Work',
    account: 'work@example.test',
    status,
    reason,
    statusSince: new Date(0),
    lastSuccessAt: null,
    scopes: [],
    missing: [],
    fingerprint: null,
    forget: null,
  });

  expect(formatted).toBe(text);
});
