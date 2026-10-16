import { readMessageEntries } from './read-message-entries';
import type { StoreParts } from './types';

// Adds your messages recorded since the last catch-up to the message indexes, and waits for their
// vectors unless a rebuild runs, so a message matches by meaning on the next turn. A message
// forgotten while the catch-up read it is dropped again, so its words never stay.
export function updateMessageIndexes(
  parts: Pick<StoreParts, 'context' | 'messages'>,
): Promise<void> {
  const messages = parts.messages;

  return messages.lock(async () => {
    const read = await readMessageEntries(parts.context, messages.cursor.readThrough());

    for (const entry of read.entries) {
      // oxlint-disable-next-line no-await-in-loop -- one connection runs one statement at a time
      await messages.index.update(entry);

      messages.vectors?.update(entry);
    }

    messages.cursor.updateThrough(read.through);

    await removeForgottenEntries(parts, read.entries);

    if (read.entries.length > 0 && messages.vectors?.isReady() === true) {
      await messages.vectors.waitForIdle();
    }
  });
}

async function removeForgottenEntries(
  parts: Pick<StoreParts, 'messages'>,
  entries: readonly { readonly itemID: string }[],
): Promise<void> {
  const cursor = parts.messages.cursor;

  for (const entry of entries.filter((added) => cursor.isRemoved(Number(added.itemID)))) {
    // oxlint-disable-next-line no-await-in-loop -- one connection runs one statement at a time
    await parts.messages.index.remove(entry.itemID);

    parts.messages.vectors?.remove(entry.itemID);
  }
}
