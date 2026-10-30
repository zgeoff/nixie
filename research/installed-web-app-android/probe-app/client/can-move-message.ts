// The states of a message in the outbox, which IndexedDB keeps across restarts of the phone. A
// message that leaves the outbox stays as a sent or refused row, so its ID never queues again.
export type MessageState = 'queued' | 'sent' | 'refused';

const messageTransitions: Record<MessageState | 'absent', readonly MessageState[]> = {
  absent: ['queued'],
  queued: ['sent', 'refused'],
  sent: [],
  refused: [],
};

export function canMoveMessage(from: MessageState | 'absent', to: MessageState): boolean {
  return messageTransitions[from].includes(to);
}
