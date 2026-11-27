import { expect, test } from 'bun:test';
import type { WakeMatch } from '../types';
import { isWakeMatch } from './is-wake-match';

function setupTest() {
  return {
    mail: {
      from: 'Hello@Library.example.org',
      subject: 'Your Sign-In Code',
      threadID: 'th6p2k9w4x',
    },
  };
}

test.each<[string, WakeMatch, boolean]>([
  ['an empty match takes every mail', {}, true],
  ['an exact address without case', { from: ['hello@library.example.org'] }, true],
  ['another address', { from: ['news@library.example.org'] }, false],
  ['a domain', { from: ['@library.example.org'] }, true],
  ['a subdomain of the domain', { from: ['@example.org'] }, false],
  ['one address of a list', { from: ['news@school.example.org', '@library.example.org'] }, true],
  ['a subject substring without case', { subject: 'sign-in' }, true],
  ['a subject that is absent', { subject: 'receipt' }, false],
  ['the thread of the mail', { thread: 'th6p2k9w4x' }, true],
  ['another thread', { thread: 'thzzzzzzzz' }, false],
  ['every field present together', { from: ['@library.example.org'], subject: 'receipt' }, false],
])('#isWakeMatch takes %s', (_name, match, expected) => {
  const ctx = setupTest();

  expect(isWakeMatch(match, ctx.mail)).toBe(expected);
});

test.each<[string, WakeMatch, boolean]>([
  ['a body substring without case', { body: 'CODE IS' }, true],
  ['a body that is absent', { body: 'receipt' }, false],
  ['the sender name of a text without case', { from: ['example'], body: 'code' }, true],
])('#isWakeMatch takes a text with %s', (_name, match, expected) => {
  const text = { from: 'Example', subject: '', threadID: '', body: 'Your code is 5521' };

  expect(isWakeMatch(match, text)).toBe(expected);
});

test('#isWakeMatch refuses a body match on a mail, which has no body', () => {
  const ctx = setupTest();

  expect(isWakeMatch({ body: 'code' }, ctx.mail)).toBe(false);
});

test('#isWakeMatch compares subjects in NFC', () => {
  const ctx = setupTest();
  const decomposed = `Cafe${String.fromCodePoint(0x3_01)} menu`;

  expect(isWakeMatch({ subject: 'caf\u00E9' }, { ...ctx.mail, subject: decomposed })).toBe(true);
});
