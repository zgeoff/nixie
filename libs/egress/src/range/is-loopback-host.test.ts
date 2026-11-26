import { expect, test } from 'bun:test';
import { isLoopbackHost } from './is-loopback-host';

function setupTest() {
  return { isLoopback: isLoopbackHost };
}

test.each([
  ['localhost', true],
  ['127.0.0.1', true],
  ['127.12.0.9', true],
  ['[::1]', true],
  ['::1', true],
  ['128.0.0.1', false],
  ['127.0.0.256', false],
  ['10.0.0.1', false],
  ['example.com', false],
  ['127.0.0.1.example.com', false],
] as const)('it says the host %s is loopback: %s', (host, expected) => {
  const ctx = setupTest();

  expect(ctx.isLoopback(host)).toBe(expected);
});
