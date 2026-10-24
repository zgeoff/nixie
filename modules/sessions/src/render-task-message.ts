import type { LogRecord } from '@heynixie/log';
import type { StepWake, TaskMessaging } from '@heynixie/tasks';
import { canReplyWake, getTaskName, taskMessageCodec } from '@heynixie/tasks';
import { mintBlockID } from '@heynixie/wire';
import { formatMessageTime } from './format-message-time';
import type { MessageTimeOptions } from './types';

export interface TaskMessageView {
  readonly messaging: TaskMessaging;
  readonly wake: StepWake;
}

export function renderTaskMessage(
  record: LogRecord,
  times: MessageTimeOptions,
  view: TaskMessageView,
): string {
  const message = taskMessageCodec.decode(record.payload);
  const fields = record.erasable.status === 'readable' ? record.erasable.fields : {};
  const body = fields['body'];

  // The body is another model's text, so a fresh random ID that the body cannot guess closes the
  // block.
  const blockID = mintBlockID();

  const attributes: readonly (readonly [string, string])[] = [
    ['id', message.messageID],
    ['from', message.from],
    ['name', getTaskName(view.messaging, message.from)],
    ['kind', message.kind],
    ...(message.replyTo === null ? [] : [['reply-to', message.replyTo] as const]),
    ['sent', formatMessageTime(record.recordedAt, null, times)],
    ['age', formatAge(times.now.getTime() - record.recordedAt.getTime())],
    ['hop', String(message.hop)],
    ['reply-wakes', canReplyWake(view.messaging, view.wake, message.from) ? 'yes' : 'no'],
    ...(message.onBehalfOf.length === 0
      ? []
      : [['on-behalf-of', message.onBehalfOf.map((eventID) => `#${eventID}`).join(' ')] as const]),
    ['block', blockID],
  ];

  const opening = attributes.map(([name, value]) => `${name}="${escapeAttribute(value)}"`);

  return [
    `<task-message ${opening.join(' ')}>`,
    `This message is from another task, not from ${view.messaging.ownerName ?? 'the owner'}.`,
    typeof body === 'string' ? body : '[a message since forgotten]',
    `</task-message block="${blockID}">`,
  ].join('\n');
}

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

function formatAge(ageMs: number): string {
  if (ageMs < minuteMs) {
    return 'under a minute';
  }

  if (ageMs < hourMs) {
    return `${Math.floor(ageMs / minuteMs)} min`;
  }

  return ageMs < 2 * dayMs
    ? `${Math.floor(ageMs / hourMs)} h`
    : `${Math.floor(ageMs / dayMs)} days`;
}

function escapeAttribute(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}
