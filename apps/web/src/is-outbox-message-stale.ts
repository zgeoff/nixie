import type { OutboxMessage } from './types';

// A message that waited longer than this since you wrote it goes only when you choose to send it,
// because what it says may no longer hold.
const staleAfterMs = 2 * 60 * 1000;

// Whether a message waited too long to go on its own. A message stored before the outbox kept when
// you wrote it counts as stale.
export function isOutboxMessageStale(message: OutboxMessage, now: number): boolean {
  const writtenAt = message.writtenAt === undefined ? Number.NaN : Date.parse(message.writtenAt);

  return Number.isNaN(writtenAt) || now - writtenAt > staleAfterMs;
}
