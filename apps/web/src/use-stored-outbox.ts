import { contract } from '@heynixie/contract';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { isOutboxMessageStale } from './is-outbox-message-stale';
import { loadOutboxImages } from './load-outbox-images';
import { removeStaleOutboxImages } from './remove-stale-outbox-images';
import type { OutboxMessage, ReadonlyDeep } from './types';
import { updateDiscardedOutboxIDs } from './update-discarded-outbox-ids';
import type { OutboxEntry } from './use-outbox';
import { writeOutboxImages } from './write-outbox-images';

export interface StoredOutboxOptions {
  readonly entries: readonly OutboxEntry[];

  readonly forgottenClientMessageIDs: readonly string[];

  readonly now: () => number;
  readonly sendEntry: (message: OutboxMessage) => Promise<void>;
  readonly setEntries: Dispatch<SetStateAction<readonly OutboxEntry[]>>;
}

export function useStoredOutbox(options: StoredOutboxOptions): void {
  const [loaded, setLoaded] = useState(false);
  const now = options.now;
  const sendEntry = options.sendEntry;
  const setEntries = options.setEntries;
  const writtenImages = useRef(new Set<string>());

  useEffect(() => {
    const discarded = new Set(updateDiscardedOutboxIDs());

    const stored = readStoredMessages()
      .filter((message) => !discarded.has(message.clientMessageId))
      .map((message) => ({
        message,
        isStale: isOutboxMessageStale(message, now()),
      }));

    setEntries(
      stored.map((entry) => ({
        message: entry.message,
        status: entry.isStale ? 'held' : 'sending',
      })),
    );

    setLoaded(true);
    sendStoredMessages(stored, { sendEntry, setEntries, written: writtenImages.current });
  }, [now, sendEntry, setEntries]);

  useEffect(() => {
    if (loaded) {
      const forgotten = new Set([
        ...options.forgottenClientMessageIDs,
        ...updateDiscardedOutboxIDs(),
      ]);

      const merged = mergeStoredMessages(readStoredMessages(), options.entries).filter(
        (message) => !forgotten.has(message.clientMessageId),
      );

      writeStoredMessages(merged);
      void writeStoredImages(merged, writtenImages.current);

      void removeStaleOutboxImages(
        () => new Set(readStoredMessages().map((message) => message.clientMessageId)),
      );
    }
  }, [loaded, now, options.entries, options.forgottenClientMessageIDs]);
}

const storageKey = 'nixie.outbox';

// Device storage outlives a release, so a stored message that fails the current contract is
// dropped rather than sent.
const storedImageCount = z.object({ imageCount: z.int().positive().optional() });

const storedMessagesSchema = z.array(
  z.intersection(contract.conversation.send['~orpc'].inputSchema ?? z.never(), storedImageCount),
);

function readStoredMessages(): readonly OutboxMessage[] {
  const stored = globalThis.localStorage.getItem(storageKey);
  const json = stored === null ? [] : parseJSON(stored);
  const parsed = storedMessagesSchema.safeParse(json);

  return parsed.success ? parsed.data.map((message) => toOutboxMessage(message)) : [];
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function toOutboxMessage(
  stored: ReadonlyDeep<z.infer<typeof storedMessagesSchema>[number]>,
): OutboxMessage {
  const { imageCount, ...message } = stored;

  return imageCount === undefined ? message : { ...message, unreadImages: imageCount };
}

interface StoredSend {
  readonly sendEntry: StoredOutboxOptions['sendEntry'];
  readonly setEntries: StoredOutboxOptions['setEntries'];
  readonly written: Set<string>;
}

interface StoredMessage {
  readonly message: OutboxMessage;
  readonly isStale: boolean;
}

function sendStoredMessages(
  stored: readonly StoredMessage[],

  send: StoredSend,
): void {
  for (const entry of stored) {
    send.written.add(entry.message.clientMessageId);

    if (!entry.isStale) {
      void send.sendEntry(entry.message);
    }

    void loadStoredImages(entry.message, send.setEntries);
  }
}

async function loadStoredImages(
  message: OutboxMessage,
  setEntries: StoredOutboxOptions['setEntries'],
): Promise<void> {
  const loaded = await loadOutboxImages(message);

  setEntries((current) =>
    current.map((entry) =>
      entry.message.clientMessageId === message.clientMessageId
        ? { ...entry, message: loaded }
        : entry,
    ),
  );
}

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

function writeStoredMessages(messages: readonly OutboxMessage[]): void {
  if (messages.length === 0) {
    globalThis.localStorage.removeItem(storageKey);
  } else {
    globalThis.localStorage.setItem(
      storageKey,
      JSON.stringify(messages.map((message) => toStoredText(message))),
    );
  }
}

type StoredText = Omit<OutboxMessage, 'images' | 'unreadImages'> & { readonly imageCount?: number };

function toStoredText(message: OutboxMessage): StoredText {
  const imageCount = message.images?.length ?? message.unreadImages ?? 0;

  return {
    clientMessageId: message.clientMessageId,
    spans: message.spans,
    text: message.text,
    thread: message.thread,
    ...(message.timeZone === undefined ? {} : { timeZone: message.timeZone }),
    ...(message.writtenAt === undefined ? {} : { writtenAt: message.writtenAt }),
    ...(imageCount === 0 ? {} : { imageCount }),
  };
}

async function writeStoredImages(
  messages: readonly OutboxMessage[],

  written: Set<string>,
): Promise<void> {
  const unwritten = messages.filter(
    (message) => (message.images?.length ?? 0) > 0 && !written.has(message.clientMessageId),
  );

  for (const message of unwritten) {
    written.add(message.clientMessageId);
  }

  await Promise.all(
    unwritten.map((message) =>
      writeOutboxImages(message.clientMessageId, message.images ?? []).catch(() => {
        written.delete(message.clientMessageId);
      }),
    ),
  );
}
