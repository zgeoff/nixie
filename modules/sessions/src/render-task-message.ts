import type { LogRecord } from '@heynixie/log';
import type { StepWake, TaskMessaging } from '@heynixie/tasks';
import { taskMessageCodec } from '@heynixie/tasks';
import { formatMessageTime } from './format-message-time';
import { pickEnvelopeLabel } from './pick-envelope-label';
import { renderTaskEnvelope } from './render-task-envelope';
import type { MessageTimeOptions } from './types';

export interface TaskMessageView {
  readonly messaging: TaskMessaging;
  readonly wake: StepWake;
}

export function renderTaskMessage(
  record: LogRecord,
  times: MessageTimeOptions,
  view: Pick<TaskMessageView, 'messaging'>,
): string {
  const message = taskMessageCodec.decode(record.payload);
  const body = record.erasable.status === 'readable' ? record.erasable.fields['body'] : undefined;

  return renderTaskEnvelope({
    id: message.messageID,
    from: pickEnvelopeLabel(view.messaging, message.from),
    kind: message.kind,
    replyTo: message.replyTo,
    sent: formatMessageTime(record.recordedAt, null, times),
    onBehalfOf: message.onBehalfOf,
    body: typeof body === 'string' ? body : null,
  });
}
