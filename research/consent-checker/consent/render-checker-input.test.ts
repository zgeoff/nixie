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
          sequence: 1,
          text: 'save this address: 12 Quay Lane',
          spans: [
            { start: 0, end: 19, source: 'typed' },
            { start: 19, end: 31, source: 'pasted' },
          ],
        },
        { sequence: 2, text: 'thanks', spans: [{ start: 0, end: 6, source: 'typed' }] },
      ],
      call: {
        sequence: 3,
        tool: 'memory.remember',
        input: { text: 'The address is 12 Quay Lane' },
      },
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
