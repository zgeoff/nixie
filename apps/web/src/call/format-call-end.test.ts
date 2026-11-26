import { expect, test } from 'bun:test';
import { formatCallEnd } from './format-call-end';

test.each([
  { endedBy: 'you', text: 'You hung up.' },
  { endedBy: 'nixie', text: 'nixie ended the call.' },
  { endedBy: 'budget', text: 'The call budget ran out.' },
  { endedBy: 'dropped', text: 'The connection dropped.' },
  { endedBy: null, text: 'The call ended.' },
] as const)('#formatCallEnd says $text when $endedBy ended the call', (row) => {
  expect(formatCallEnd(row.endedBy)).toBe(row.text);
});
