import { expect, test } from 'bun:test';
import { collectGuestAddresses } from './collect-guest-addresses';

test('#collectGuestAddresses leaves out the account and the organizer', () => {
  const guests = collectGuestAddresses([
    { email: 'me@example.test', self: true, organizer: true },
    { email: 'lee@example.org' },
    { email: 'boss@example.org', organizer: true },
    { email: 'kim@example.org', responseStatus: 'needsAction' },
  ]);

  expect(guests).toStrictEqual(['lee@example.org', 'kim@example.org']);
});

test('#collectGuestAddresses answers none for a value that is no attendee list', () => {
  expect(collectGuestAddresses(undefined)).toStrictEqual([]);
});
