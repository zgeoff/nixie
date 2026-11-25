import { expect, test } from 'bun:test';
import { isSupportedGateway } from './is-supported-gateway';

test.each([
  { version: 'atc-gateway/7.12.0', expected: true },
  { version: 'atc-gateway/7.40.2', expected: true },
  { version: 'atc-gateway/7.11.9', expected: false },
  { version: 'atc-gateway/8.0.0', expected: false },
  { version: 'atc/7.12.0', expected: false },
  { version: undefined, expected: false },
])('it reads the gateway version $version as supported: $expected', (row) => {
  expect(isSupportedGateway(row.version)).toBe(row.expected);
});
