import type { StoreParts } from './types';

// Drops your messages at the sequences from the message indexes, for a forget of a message or of an
// item they backed, and marks them removed so a catch-up that read one before the forget drops it
// again.
export async function removeMessageEntries(
  parts: Pick<StoreParts, 'messages'>,
  sequences: readonly number[],
): Promise<void> {
  for (const sequence of sequences) {
    parts.messages.cursor.addRemoved(sequence);

    await parts.messages.index.remove(String(sequence));

    parts.messages.vectors?.remove(String(sequence));
  }
}
