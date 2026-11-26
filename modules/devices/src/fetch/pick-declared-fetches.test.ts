import { expect, test } from 'bun:test';
import { makeAddressCheck } from '@heynixie/egress';
import { pickDeclaredFetches } from './pick-declared-fetches';

function setupTest() {
  return { checkAddress: makeAddressCheck(['10.0.0.0/8']) };
}

test('it keeps the fetches and lists each host once', () => {
  const ctx = setupTest();

  const picked = pickDeclaredFetches(
    [
      { url: 'https://tides.example/today', refreshMinutes: 30 },
      { url: 'https://tides.example/week' },
      { url: 'https://weather.example:8443/now' },
    ],
    ctx.checkAddress,
  );

  expect(picked).toStrictEqual({
    status: 'ok',
    fetches: [
      { url: 'https://tides.example/today', refreshMinutes: 30 },
      { url: 'https://tides.example/week', refreshMinutes: undefined },
      { url: 'https://weather.example:8443/now', refreshMinutes: undefined },
    ],
    hosts: ['tides.example', 'weather.example:8443'],
  });
});

test.each([
  ['a plain http URL', 'http://tides.example/today'],
  ['a URL with a user name', 'https://user@tides.example/today'],
  ['a URL with a password', 'https://user:pass@tides.example/today'],
  ['a host with no dot', 'https://intranet/today'],
  ['localhost', 'https://localhost/today'],
  ['an address of a private network', 'https://10.1.2.3/today'],
  ['text that is no URL', 'tides today'],
])('it refuses %s', (_title, url) => {
  const ctx = setupTest();

  expect(pickDeclaredFetches([{ url }], ctx.checkAddress)).toStrictEqual({ status: 'refused' });
});

test('it refuses a URL named twice', () => {
  const ctx = setupTest();

  const picked = pickDeclaredFetches(
    [{ url: 'https://tides.example/today' }, { url: 'https://tides.example/today' }],
    ctx.checkAddress,
  );

  expect(picked).toStrictEqual({ status: 'refused' });
});

test('it takes a public address', () => {
  const ctx = setupTest();
  const picked = pickDeclaredFetches([{ url: 'https://8.8.8.8/today' }], ctx.checkAddress);

  expect(picked).toMatchObject({ status: 'ok', hosts: ['8.8.8.8'] });
});
