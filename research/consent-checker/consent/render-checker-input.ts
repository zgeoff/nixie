import { renderMarkedText } from './render-marked-text.ts';
import type { ConsentCase } from './types.ts';

// The checker's input: each message that started the turn, with every span the owner did not type
// marked as pasted, then the call as structured fields.
export function renderCheckerInput(consentCase: ConsentCase): string {
  const messages = consentCase.messages.map(
    (message) => `<owner_message>\n${renderMarkedText(message)}\n</owner_message>`,
  );
  const call = JSON.stringify({ tool: consentCase.call.tool, input: consentCase.call.input }, null, 2);

  return `${messages.join('\n\n')}\n\n<tool_call>\n${call}\n</tool_call>`;
}
