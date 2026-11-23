import type { TaskMessageKind } from '@heynixie/tasks';
import { mintBlockID, renderFenced } from '@heynixie/wire';

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

export function renderTaskEnvelope(
  envelope: TaskEnvelope,
  mint: () => string = mintBlockID,
): string {
  // The body is another model's text, so a fresh random ID that the body cannot guess closes the
  // element.
  return renderFenced({
    tag: 'task-message',
    attributes: {
      id: envelope.id,
      from: envelope.from,
      kind: envelope.kind,
      ...(envelope.replyTo === null ? {} : { 'reply-to': envelope.replyTo }),
      sent: envelope.sent,
      ...(envelope.onBehalfOf.length === 0
        ? {}
        : { 'on-behalf-of': envelope.onBehalfOf.join(' ') }),
    },
    text: envelope.body ?? '[a message since forgotten]',
    fence: mint(),
  });
}
