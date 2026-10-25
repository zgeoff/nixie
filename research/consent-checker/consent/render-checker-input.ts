import type { ConsentCase, ConsentMessage } from './types.ts';

// The checker's input: each message that started the turn, with every span the owner did not type
// marked as pasted, then the call as structured fields.
export function renderCheckerInput(consentCase: ConsentCase): string {
  const messages = consentCase.messages.map(
    (message) => `<owner_message>\n${renderMarkedText(message)}\n</owner_message>`,
  );
  const call = JSON.stringify({ tool: consentCase.call.tool, input: consentCase.call.input }, null, 2);

  return `${messages.join('\n\n')}\n\n<tool_call>\n${call}\n</tool_call>`;
}

function renderMarkedText(message: ConsentMessage): string {
  const foreign = message.spans
    .filter((span) => span.source !== 'typed' && span.end > span.start)
    .toSorted((first, second) => first.start - second.start);
  let text = '';
  let at = 0;

  for (const span of foreign) {
    const start = Math.max(span.start, at);

    if (span.end <= start) {
      continue;
    }

    text += `${message.text.slice(at, start)}«pasted»${message.text.slice(start, span.end)}«/pasted»`;
    at = span.end;
  }

  return text + message.text.slice(at);
}
