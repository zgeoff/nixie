import { getTaskName } from './get-task-name';
import type { taskExchangeLimitedCodec } from './task-exchange-limited-codec';
import type { TaskMessaging } from './types';

export interface ExchangeNotice {
  readonly text: string;
  readonly link: { readonly label: string; readonly messageID: string };
}

export function renderExchangeNotice(
  messaging: Pick<TaskMessaging, 'directory'>,
  notice: ReturnType<typeof taskExchangeLimitedCodec.decode>,
): ExchangeNotice {
  const sender = getTaskName(messaging, notice.from);
  const receiver = getTaskName(messaging, notice.to);

  const waiting =
    notice.waiting === null
      ? 'Nothing is waiting on you.'
      : `${getTaskName(messaging, notice.waiting.taskID)} is waiting on ${getTaskName(messaging, notice.waiting.onTaskID)}.`;

  return {
    text: `${sender} and ${receiver} exchanged ${notice.hops} messages with no outside cause. New messages between them wait for the next one. ${waiting}`,
    link: { label: 'Open the exchange', messageID: notice.messageID },
  };
}
