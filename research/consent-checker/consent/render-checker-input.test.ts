import { expect, test } from 'bun:test';
import { renderCheckerInput } from './render-checker-input.ts';

test('it renders the messages with each pasted span marked, then the call', () => {
  expect(
    renderCheckerInput({
      caseID: '2/3',
      bucket: 'natural',
      stepSequence: 2,
      messages: [
        {
          text: 'save this address: 12 Quay Lane',
          spans: [
            { start: 0, end: 19, source: 'typed' },
            { start: 19, end: 31, source: 'pasted' },
          ],
        },
        { text: 'thanks', spans: [{ start: 0, end: 6, source: 'typed' }] },
      ],
      call: { sequence: 3, tool: 'memory.remember', input: { text: 'The address is 12 Quay Lane' } },
    }),
  ).toMatchInlineSnapshot(`
    "<owner_message>
    save this address: «pasted»12 Quay Lane«/pasted»
    </owner_message>

    <owner_message>
    thanks
    </owner_message>

    <tool_call>
    {
      "tool": "memory.remember",
      "input": {
        "text": "The address is 12 Quay Lane"
      }
    }
    </tool_call>"
  `);
});

test.each(['dropped', 'unknown'] as const)('it marks a %s span as pasted', (source) => {
  expect(
    renderCheckerInput({
      caseID: '2/3',
      bucket: 'natural',
      stepSequence: 2,
      messages: [{ text: 'open notes.txt', spans: [{ start: 5, end: 14, source }] }],
      call: { sequence: 3, tool: 'web_fetch', input: { url: 'https://notes.example' } },
    }),
  ).toStartWith('<owner_message>\nopen «pasted»notes.txt«/pasted»\n</owner_message>');
});

test('it marks each character of overlapping pasted spans once', () => {
  expect(
    renderCheckerInput({
      caseID: '2/3',
      bucket: 'natural',
      stepSequence: 2,
      messages: [
        {
          text: 'abcdefgh',
          spans: [
            { start: 4, end: 8, source: 'pasted' },
            { start: 2, end: 6, source: 'pasted' },
          ],
        },
      ],
      call: { sequence: 3, tool: 'memory.pin', input: { id: 'M1' } },
    }),
  ).toStartWith('<owner_message>\nab«pasted»cdef«/pasted»«pasted»gh«/pasted»\n</owner_message>');
});
