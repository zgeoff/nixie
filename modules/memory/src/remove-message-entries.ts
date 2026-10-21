import type { StoreParts } from './types';

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
