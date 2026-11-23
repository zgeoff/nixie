import { createHash } from 'node:crypto';

// What a recalled record keeps of the trigger phrase that placed an item: a digest, so the record
// holds no text that a forget would have to erase.
export function buildTriggerKey(phrase: string): string {
  return createHash('sha256').update(phrase).digest('hex').slice(0, 16);
}
