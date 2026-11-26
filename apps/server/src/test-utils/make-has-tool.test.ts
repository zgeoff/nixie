import { expect, test } from 'bun:test';
import { makeHasTool } from './make-has-tool';

test.each([
  { offers: 'the tool', body: { tools: [{ name: 'mcp__nixie__gmail_send' }] }, expected: true },
  { offers: 'other tools', body: { tools: [{ name: 'StructuredOutput' }] }, expected: false },
  { offers: 'no tools', body: {}, expected: false },
])('it answers $expected for a request that offers $offers', (row) => {
  const hasSend = makeHasTool('mcp__nixie__gmail_send');

  expect(hasSend(row.body)).toBe(row.expected);
});
