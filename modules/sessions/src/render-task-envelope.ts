import type { TaskMessageKind } from '@heynixie/tasks';
import { mintBlockID } from '@heynixie/wire';

export interface TaskEnvelope {
  readonly id: string;
  readonly from: string;
  readonly kind: TaskMessageKind;
  readonly replyTo: string | null;
  readonly sent: string;
  readonly onBehalfOf: readonly string[];

  // null once a forget removes the body
  readonly body: string | null;
}

export function renderTaskEnvelope(envelope: TaskEnvelope): string {
  // The body is another model's text, so a fresh random ID that the body cannot guess closes the
  // element.
  const fence = mintBlockID();

  const attributes: (readonly [string, string])[] = [
    ['id', envelope.id],
    ['from', envelope.from],
    ['kind', envelope.kind],
    ...(envelope.replyTo === null ? [] : [['reply-to', envelope.replyTo] as const]),
    ['sent', envelope.sent],
    ...(envelope.onBehalfOf.length === 0
      ? []
      : [['on-behalf-of', envelope.onBehalfOf.join(' ')] as const]),
    ['fence', fence],
  ];

  return [
    `<task-message ${attributes.map(([name, value]) => `${name}="${escapeAttribute(value)}"`).join(' ')}>`,
    envelope.body ?? '[a message since forgotten]',
    `</task-message fence="${fence}">`,
  ].join('\n');
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
