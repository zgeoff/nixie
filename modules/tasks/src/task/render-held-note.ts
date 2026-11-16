import { match } from 'ts-pattern';
import type { TaskMessageKind } from '../types';
import type { TaskMessageHold } from './message/plan-task-message';

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
    .with(
      'next_run',
      () =>
        `${message.name} is asleep and reads this at its next run. A reply, if any, arrives as a new message.`,
    )
    .exhaustive();
}
