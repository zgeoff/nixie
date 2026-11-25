import { expect, test } from 'bun:test';
import { pickConsentOutcome } from './pick-consent-outcome';
import type { KnownAccount } from './pick-consent-outcome';

function setupTest() {
  const accounts = new Map<string, KnownAccount>([
    ['work', { connectionID: 'work', subject: 'sub-work', binding: 'enabled' }],
    ['home', { connectionID: 'home', subject: 'sub-home', binding: 'enabled' }],
    ['leaving', { connectionID: 'leaving', subject: 'sub-leaving', binding: 'removing' }],
  ]);

  return { accounts };
}

test.each([
  {
    title: 'a new account becomes a new connection',
    facts: { again: null, subject: 'sub-new', known: ['work'] },
    expected: { kind: 'new' },
  },
  {
    title: 'an account a live connection reaches renews that connection',
    facts: { again: null, subject: 'sub-work', known: ['work', 'home'] },
    expected: { kind: 'renew', connectionID: 'work' },
  },
  {
    title: 'a consent again for the same account renews its connection',
    facts: { again: 'work', subject: 'sub-work', known: ['work', 'home'] },
    expected: { kind: 'renew', connectionID: 'work' },
  },
  {
    title: 'a consent again for another account is a mismatch, and revokes',
    facts: { again: 'work', subject: 'sub-new', known: ['work', 'home'] },
    expected: { kind: 'discard', reason: 'account_mismatch', isRevoked: true },
  },
  {
    title: 'a consent again whose account another live connection reaches never revokes',
    facts: { again: 'work', subject: 'sub-home', known: ['work', 'home'] },
    expected: { kind: 'discard', reason: 'account_mismatch', isRevoked: false },
  },
  {
    title: 'a consent again for a connection under Forget keeps no token',
    facts: { again: 'leaving', subject: 'sub-leaving', known: ['leaving'] },
    expected: { kind: 'discard', reason: 'connection_forgotten', isRevoked: true },
  },
  {
    title: 'a consent again for a connection that is gone keeps no token',
    facts: { again: 'gone', subject: 'sub-new', known: ['work'] },
    expected: { kind: 'discard', reason: 'connection_forgotten', isRevoked: true },
  },
  {
    title: 'an account whose connection is under Forget waits for it',
    facts: { again: null, subject: 'sub-leaving', known: ['work', 'leaving'] },
    expected: { kind: 'wait', connectionID: 'leaving' },
  },
])('#pickConsentOutcome decides $title', (row) => {
  const ctx = setupTest();

  const facts = {
    ...row.facts,
    known: row.facts.known.flatMap((name) => ctx.accounts.get(name) ?? []),
  };

  expect(pickConsentOutcome(facts)).toStrictEqual(row.expected);
});
