import type { ContractClient } from '@heynixie/contract';
import { useCallback, useRef, useState } from 'react';
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
export function useOutbox() {
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
  const add = useCallback(
    (message: OutboxMessage) => {
      setEntries((current) => [...current, { message, status: 'sending' }]);
      void sendEntry(message);
    },
    [sendEntry],
  );

  useStoredOutbox({ entries, sendEntry, setEntries });

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
    });

    return 'sent';
  } catch {
    return 'failed';
  }
}
