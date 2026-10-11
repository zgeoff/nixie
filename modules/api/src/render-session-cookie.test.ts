import { expect, test } from 'bun:test';
import { renderSessionCookie } from './render-session-cookie';

test('it renders a host-only HttpOnly Secure SameSite=Strict cookie for every path', () => {
  expect(renderSessionCookie('abc')).toBe(
    'nixie_session=abc; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=34560000',
  );
});

test('it renders a cookie that a browser drops at once when the token is null', () => {
  expect(renderSessionCookie(null)).toBe(
    'nixie_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0',
  );
});
