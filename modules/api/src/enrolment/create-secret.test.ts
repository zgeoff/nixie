import { expect, test } from 'bun:test';
import { createSecret } from './create-secret';

test('it creates a session token of 32 bytes in base64url', () => {
  expect(Buffer.from(createSecret('session-token'), 'base64url')).toHaveLength(32);
});

test('it creates an enrolment code of 2 groups of 5 base32 characters', () => {
  expect(createSecret('enrolment-code')).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/u);
});

test('it creates a different secret each time', () => {
  expect(createSecret('session-token')).not.toBe(createSecret('session-token'));
});
