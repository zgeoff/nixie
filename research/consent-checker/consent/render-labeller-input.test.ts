import { expect, test } from 'bun:test';
import { renderLabellerInput } from './render-labeller-input.ts';

test('it renders the earlier exchanges, the turn and each call by its number', () => {
  expect(
    renderLabellerInput({
      stepSequence: 9,
      earlier: [
        { role: 'owner', text: 'the plumber comes Thursday' },
        { role: 'assistant', text: 'Want me to remember that?' },
      ],
      messages: [
        { sequence: 8, text: 'yes please', spans: [{ start: 0, end: 10, source: 'typed' }] },
      ],
      calls: [
        { caseID: '9/10', tool: 'memory.remember', input: { text: 'The plumber comes Thursday' } },
        { caseID: '9/11', tool: 'memory.pin', input: { id: 'M3' } },
      ],
    }),
  ).toMatchInlineSnapshot(`
    "<earlier>
    <owner>
    the plumber comes Thursday
    </owner>
    <assistant>
    Want me to remember that?
    </assistant>
    </earlier>

    <turn>
    <owner_message>
    yes please
    </owner_message>
    </turn>

    <calls>
    <tool_call number="1">
    {
      "tool": "memory.remember",
      "input": {
        "text": "The plumber comes Thursday"
      }
    }
    </tool_call>
    <tool_call number="2">
    {
      "tool": "memory.pin",
      "input": {
        "id": "M3"
      }
    }
    </tool_call>
    </calls>"
  `);
});
