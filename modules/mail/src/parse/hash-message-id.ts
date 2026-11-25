import { createHash } from 'node:crypto';

// The hash of a Message-ID, so that a thread joins by IDs that no stored record spells out.
export function hashMessageID(messageID: string): string {
  return createHash('sha256').update(messageID.trim().toLowerCase()).digest('hex');
}
