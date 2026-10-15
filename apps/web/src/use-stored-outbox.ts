import { contract } from '@heynixie/contract';
import type { Dispatch, SetStateAction } from 'react';
import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { loadOutboxImages } from './load-outbox-images';
import { removeStaleOutboxImages } from './remove-stale-outbox-images';
import type { OutboxMessage } from './types';
import type { OutboxEntry } from './use-outbox';
import { writeOutboxImages } from './write-outbox-images';

export interface StoredOutboxOptions {
  readonly entries: readonly OutboxEntry[];

  // a forgotten message never goes back to storage, whatever status a stale render gives it
  readonly forgottenClientMessageIDs: readonly string[];
  readonly sendEntry: (message: OutboxMessage) => Promise<void>;
  readonly setEntries: Dispatch<SetStateAction<readonly OutboxEntry[]>>;
}

const storageKey = 'nixie.outbox';

// Keeps the outbox's unconfirmed messages in device storage: the text in localStorage, and each
// message's images in IndexedDB under its client message ID. Storage exists only in the browser, so
// the outbox loads after hydration and sends again whatever an earlier page left unsent.
export function useStoredOutbox(options: StoredOutboxOptions): void {
  const [loaded, setLoaded] = useState(false);
  const sendEntry = options.sendEntry;
  const setEntries = options.setEntries;

  // the messages whose images IndexedDB holds already, so a later render does not write them again
  const writtenImages = useRef(new Set<string>());

  useEffect(() => {
    const stored = readStoredMessages();

    setEntries(stored.map((message) => ({ message, status: 'sending' })));
    setLoaded(true);
    void sendStoredMessages(stored, { sendEntry, setEntries, written: writtenImages.current });
  }, [sendEntry, setEntries]);

  useEffect(() => {
    if (loaded) {
      const forgotten = new Set(options.forgottenClientMessageIDs);

      const merged = mergeStoredMessages(readStoredMessages(), options.entries).filter(
        (message) => !forgotten.has(message.clientMessageId),
      );

      writeStoredMessages(merged);
      void writeStoredImages(merged, writtenImages.current);
      void removeStaleOutboxImages(new Set(merged.map((message) => message.clientMessageId)));
    }
  }, [loaded, options.entries, options.forgottenClientMessageIDs]);
}

interface StoredSend {
  readonly sendEntry: StoredOutboxOptions['sendEntry'];
  readonly setEntries: StoredOutboxOptions['setEntries'];
  readonly written: Set<string>;
}

// Each stored message goes again in the order it was written, once its images are read back, and
// its entry takes the images, so the page shows them while it sends. A message whose images do not
// read back fails, and keeps its place in storage for a retry.
async function sendStoredMessages(
  stored: readonly OutboxMessage[],
  send: StoredSend,
): Promise<void> {
  for (const message of stored) {
    // oxlint-disable-next-line no-await-in-loop -- the sends keep the order the messages were written in
    const loaded = await loadOutboxImages(message);

    send.written.add(message.clientMessageId);

    send.setEntries((current) =>
      current.map((entry) =>
        entry.message.clientMessageId === message.clientMessageId
          ? { ...entry, message: loaded }
          : entry,
      ),
    );

    void send.sendEntry(loaded);
  }
}

// IndexedDB keeps a copy of each unconfirmed message's images until the message leaves storage
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
// rather than sent. Each message keeps the count of the images IndexedDB holds for it.
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

// the images stay unread until the page reads them back from IndexedDB
function toOutboxMessage(stored: z.infer<typeof storedMessagesSchema>[number]): OutboxMessage {
  const { imageCount, ...message } = stored;

  return imageCount === undefined ? message : { ...message, unreadImages: imageCount };
}

function parseJSON(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

// the images stay out of localStorage, which keeps only text
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

// an image the page has not read back yet still counts, because IndexedDB still holds it
function toStoredText(message: OutboxMessage): StoredText {
  const imageCount = message.images?.length ?? message.unreadImages ?? 0;

  return {
    clientMessageId: message.clientMessageId,
    spans: message.spans,
    text: message.text,
    thread: message.thread,
    ...(message.timeZone === undefined ? {} : { timeZone: message.timeZone }),
    ...(imageCount === 0 ? {} : { imageCount }),
  };
}
