import { match } from 'ts-pattern';
import { isWaitingKind } from './is-waiting-kind';
import type { TaskMessageHold } from './plan-task-message';
import type { TaskMessageKind } from './types';

export interface HeldMessage {
  readonly hold: TaskMessageHold;
  readonly kind: TaskMessageKind;
  readonly name: string;
  readonly messageID: string;
  readonly hop: number;
  readonly ownerName: string | null;
}

export function renderHeldNote(message: HeldMessage): string | null {
  const owner = message.ownerName ?? 'the owner';

  return match(message.hold)
    .with('none', () => null)
    .with(
      'hop_limit',
      () =>
        `Delivered to ${message.name} as ${message.messageID}. It did not wake them, because this exchange reached ${message.hop - 1} messages with no message from ${owner}, timer or outside event. They will read it at their next wake, with any earlier messages. Sending it again adds to the count and does not deliver it sooner.`,
    )
    .with('next_run', () => {
      const reply = isWaitingKind(message.kind)
        ? ' You do not wait on them for an answer, and a reply, if any, arrives as a new message.'
        : '';

      return `Delivered to ${message.name} as ${message.messageID}. It did not wake them, because ${message.name} runs on its own schedule and reads messages only then. They will read it at their next run, with any earlier messages.${reply} Sending it again does not deliver it sooner.`;
    })
    .exhaustive();
}
