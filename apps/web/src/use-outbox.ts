import type { ContractClient } from '@heynixie/contract';
import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { OutboxMessage } from './types';
import { useNixieClient } from './use-nixie-client';
import { useStoredOutbox } from './use-stored-outbox';

export interface OutboxEntry {
  readonly message: OutboxMessage;
  readonly status: 'failed' | 'sending' | 'sent';
}

// Keeps the messages this device sent until the conversation shows them. An unconfirmed message
// stays in device storage and goes again with its first client message ID; a confirmed one stays
// in memory until its record arrives.
export function useOutbox(forgottenClientMessageIDs: readonly string[]) {
  const client = useNixieClient().client;
  const [entries, setEntries] = useState<readonly OutboxEntry[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());

  // Sends wait their turn, so the API writes the messages in the order you sent them.
  const sendEntry = useCallback(
    (message: OutboxMessage): Promise<void> => {
      setEntries((current) => buildEntriesWithStatus(current, message, 'sending'));

      const previous = queue.current;

      queue.current = (async () => {
        await previous;

        const status = await trySendMessage(client, message);

        setEntries((current) => buildEntriesWithStatus(current, message, status));
      })();

      return queue.current;
    },
    [client],
  );

  // A new message takes the browser's time zone as you write it, and keeps it through every retry.
  const add = useCallback(
    (written: Omit<OutboxMessage, 'timeZone'>) => {
      const message = {
        ...written,
        timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
      };

      setEntries((current) => [...current, { message, status: 'sending' }]);
      void sendEntry(message);
    },
    [sendEntry],
  );

  useStoredOutbox({ entries, forgottenClientMessageIDs, sendEntry, setEntries });

  // A forgotten message goes from memory before the page paints, so its text never shows again as
  // a sent message; the stored outbox keeps it out of storage, so a reload never sends it.
  useLayoutEffect(() => {
    if (forgottenClientMessageIDs.length === 0) {
      return;
    }

    const removed = new Set(forgottenClientMessageIDs);

    setEntries((current) =>
      current.some((entry) => removed.has(entry.message.clientMessageId))
        ? current.filter((entry) => !removed.has(entry.message.clientMessageId))
        : current,
    );
  }, [forgottenClientMessageIDs]);

  return { add, entries, retry: sendEntry };
}

function buildEntriesWithStatus(
  entries: readonly OutboxEntry[],
  message: OutboxMessage,
  status: OutboxEntry['status'],
): readonly OutboxEntry[] {
  return entries.map((entry) =>
    entry.message.clientMessageId === message.clientMessageId ? { ...entry, status } : entry,
  );
}

async function trySendMessage(
  client: ContractClient,
  message: OutboxMessage,
): Promise<'failed' | 'sent'> {
  try {
    await client.conversation.send({
      clientMessageId: message.clientMessageId,
      spans: Array.from(message.spans, (span) => ({
        end: span.end,
        source: span.source,
        start: span.start,
      })),
      text: message.text,
      thread: message.thread,
      ...(message.timeZone === undefined ? {} : { timeZone: message.timeZone }),
      ...(message.images === undefined ? {} : { images: [...message.images] }),
    });

    return 'sent';
  } catch {
    return 'failed';
  }
}
