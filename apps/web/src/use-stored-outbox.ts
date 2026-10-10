import { contract } from '@heynixie/contract';
import { useEffect, useState } from 'react';
import { z } from 'zod';
import type { OutboxMessage } from './types';
import type { OutboxEntry } from './use-outbox';

export interface StoredOutboxOptions {
  readonly entries: readonly OutboxEntry[];
  readonly sendEntry: (message: OutboxMessage) => Promise<void>;
  readonly setEntries: (entries: readonly OutboxEntry[]) => void;
}

const storageKey = 'nixie.outbox';

// Keeps the outbox's unconfirmed messages in device storage. Storage exists only in the browser,
// so the outbox loads after hydration and sends again whatever an earlier page left unsent.
export function useStoredOutbox(options: StoredOutboxOptions): void {
  const [loaded, setLoaded] = useState(false);
  const sendEntry = options.sendEntry;
  const setEntries = options.setEntries;

  useEffect(() => {
    const stored = readStoredMessages();

    setEntries(stored.map((message) => ({ message, status: 'sending' })));
    setLoaded(true);

    for (const message of stored) {
      void sendEntry(message);
    }
  }, [sendEntry, setEntries]);

  useEffect(() => {
    if (loaded) {
      writeStoredMessages(mergeStoredMessages(readStoredMessages(), options.entries));
    }
  }, [loaded, options.entries]);
}

// Another tab shares the storage key, so a write keeps every stored message this outbox does not
// hold, adds this outbox's unconfirmed messages, and drops only the ones it saw confirmed.
function mergeStoredMessages(
  stored: readonly OutboxMessage[],
  entries: readonly OutboxEntry[],
): readonly OutboxMessage[] {
  const held = new Set(entries.map((entry) => entry.message.clientMessageId));
  const others = stored.filter((message) => !held.has(message.clientMessageId));
  const unconfirmed = entries
    .filter((entry) => entry.status !== 'sent')
    .map((entry) => entry.message);

  return [...others, ...unconfirmed];
}

// Storage outlives a release, so a stored message that no longer fits the contract is dropped
// rather than sent.
const storedMessagesSchema = z.array(contract.conversation.send['~orpc'].inputSchema ?? z.never());

function readStoredMessages(): readonly OutboxMessage[] {
  const stored = globalThis.localStorage.getItem(storageKey);
  const json = stored === null ? [] : parseJSON(stored);
  const parsed = storedMessagesSchema.safeParse(json);

  return parsed.success ? parsed.data : [];
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function writeStoredMessages(messages: readonly OutboxMessage[]): void {
  if (messages.length === 0) {
    globalThis.localStorage.removeItem(storageKey);
  } else {
    globalThis.localStorage.setItem(storageKey, JSON.stringify(messages));
  }
}
