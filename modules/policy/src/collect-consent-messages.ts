import type { ConsentMessage, PolicyCall } from './types';

export interface ConsentWindow {
  readonly linkMaxAgeMs: number;
}

// The turn's own message counts at any age. A linked message counts only within the window, and an
// ID that names no owner message never reaches here, because the reader returns owner messages only.
export function collectConsentMessages(
  call: Pick<PolicyCall, 'turnMessageSequence' | 'onBehalfOf' | 'at'>,
  read: readonly ConsentMessage[],
  window: ConsentWindow,
): readonly ConsentMessage[] {
  const isLinkedInTime = (message: ConsentMessage): boolean =>
    call.onBehalfOf.includes(message.sequence) && call.at - message.sentAt <= window.linkMaxAgeMs;

  return read
    .filter((message) => message.sequence === call.turnMessageSequence || isLinkedInTime(message))
    .toSorted((left, right) => left.sequence - right.sequence);
}
