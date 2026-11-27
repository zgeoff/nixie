import type { ToolDefinition } from '@heynixie/tools';
import { checkSendArguments } from '../connector/check-send-arguments';
import { phoneDeclarations } from '../connector/phone-declarations';
import { phoneToolNames } from '../connector/phone-tool-names';

// phone.send: queues one text from the assistant's own number. The action's outcome holds the sent
// text's ID and the action's ID. A number that is not in E.164 form and a body over 640 characters
// end the call as plain error text, so neither asks for an approval.
export function buildPhoneSendTool(): ToolDefinition {
  return {
    name: phoneToolNames.send,
    description:
      'Sends a text from your own phone number. The send is queued, and the call returns the ' +
      "action's ID. Once it runs, its outcome holds the sent text's ID and the action's ID. to is " +
      'a number in E.164 form, and body takes at most 640 characters.',
    input: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'a number in E.164 form, such as +61400000000' },
        body: { type: 'string', minLength: 1 },
      },
      required: ['to', 'body'],
      additionalProperties: false,
    },
    output: { type: 'object' },
    declaration: phoneDeclarations.send,
    execution: 'queued',
    clear: (input) => Promise.resolve(checkSendArguments(input)),
    run: () =>
      Promise.resolve({ status: 'error', message: `${phoneToolNames.send} runs only queued` }),
  };
}
