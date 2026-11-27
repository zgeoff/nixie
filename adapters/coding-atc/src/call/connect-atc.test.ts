import { expect, test } from 'bun:test';
import { toGatewayURL } from './connect-atc';

test.each([
  { url: 'https://atc.example.net', expected: 'https://atc.example.net' },
  { url: 'https://atc.example.net/', expected: 'https://atc.example.net' },
  { url: 'https://atc.example.net/mcp', expected: 'https://atc.example.net' },
  { url: 'https://atc.example.net/mcp/', expected: 'https://atc.example.net' },
  { url: 'https://example.net/atc/mcp', expected: 'https://example.net/atc' },
])('#toGatewayURL gives $expected for $url', (row) => {
  expect(toGatewayURL(row.url)).toBe(row.expected);
});
