import type { OutboxMessage } from './types';

const staleAfterMs = 2 * 60 * 1000;

export function isOutboxMessageStale(message: OutboxMessage, now: number): boolean {
  const writtenAt = message.writtenAt === undefined ? Number.NaN : Date.parse(message.writtenAt);

  return Number.isNaN(writtenAt) || now - writtenAt > staleAfterMs;
}
