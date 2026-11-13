import type { ConsentMessage, EffectDeclaration, PolicyCall } from './types';

export function renderConsentInput(
  messages: readonly ConsentMessage[],
  call: Pick<PolicyCall, 'tool' | 'destinations' | 'args'>,
  declaration: Pick<EffectDeclaration, 'effects'>,
): string {
  const owner = messages.map(
    (message) => `Message ${String(message.sequence)}:\n${renderTyped(message)}`,
  );

  const requested = JSON.stringify({
    tool: call.tool,
    effects: declaration.effects,
    destinations: call.destinations.map((destination) => destination.value),
    args: call.args,
  });

  return `${owner.join('\n\n')}\n\nCall:\n${requested}`;
}

function renderTyped(message: ConsentMessage): string {
  const parts: string[] = [];
  let cursor = 0;

  for (const span of message.spans.toSorted((left, right) => left.start - right.start)) {
    parts.push(message.text.slice(cursor, span.start));

    const text = message.text.slice(span.start, span.end);
    const marked = span.source === 'typed' ? text : `[${span.source} text: ${text}]`;

    parts.push(marked);

    cursor = span.end;
  }

  parts.push(message.text.slice(cursor));

  return parts.join('');
}
