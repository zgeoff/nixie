import { match } from 'ts-pattern';
import { canReplyWake } from './can-reply-wake';
import { getTaskName } from './get-task-name';
import type { StepWake, TaskMessaging, WakeCause } from './types';

export interface LimitedMessages {
  readonly senderID: string;
  readonly count: number;
  readonly wake: StepWake;
}

export function renderLimitedSummary(messaging: TaskMessaging, limited: LimitedMessages): string {
  const name = getTaskName(messaging, limited.senderID);
  const will = canReplyWake(messaging, limited.wake, limited.senderID) ? 'will' : 'will not';
  const cause = renderCause(messaging, limited.wake.cause);

  const arrival =
    limited.count === 1
      ? `1 message from ${name} arrived after the exchange reached its limit, so it did not wake you.`
      : `${limited.count} messages from ${name} arrived after the exchange reached its limit, so they did not wake you. Oldest first.`;

  return `${arrival} You woke for ${cause}, so a reply from you ${will} wake ${name}.`;
}

function renderCause(messaging: TaskMessaging, cause: WakeCause): string {
  return match(cause)
    .with({ kind: 'owner' }, () => `a message from ${messaging.ownerName ?? 'the owner'}`)
    .with({ kind: 'timer' }, () => 'a timer')
    .with({ kind: 'event' }, () => 'an outside event')
    .with({ kind: 'task' }, (task) => `a message from ${getTaskName(messaging, task.taskID)}`)
    .with({ kind: 'carried' }, () => 'work you continued')
    .exhaustive();
}
