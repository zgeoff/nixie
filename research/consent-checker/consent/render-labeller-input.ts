import { renderMarkedText } from './render-marked-text.ts';
import type { LabelTurn } from './types.ts';

// The labeller's input: the exchanges before the turn, the turn's messages with pasted spans marked,
// and each call by its number from 1.
export function renderLabellerInput(turn: LabelTurn): string {
  const earlier = turn.earlier.map((entry) =>
    entry.role === 'owner'
      ? `<owner>\n${entry.text}\n</owner>`
      : `<assistant>\n${entry.text}\n</assistant>`,
  );

  const messages = turn.messages.map(
    (message) => `<owner_message>\n${renderMarkedText(message)}\n</owner_message>`,
  );

  const calls = turn.calls.map(
    (call, index) =>
      `<tool_call number="${index + 1}">\n${JSON.stringify({ tool: call.tool, input: call.input }, null, 2)}\n</tool_call>`,
  );

  return [
    `<earlier>\n${earlier.join('\n')}\n</earlier>`,
    `<turn>\n${messages.join('\n')}\n</turn>`,
    `<calls>\n${calls.join('\n')}\n</calls>`,
  ].join('\n\n');
}
