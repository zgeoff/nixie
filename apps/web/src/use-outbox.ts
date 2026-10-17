import type { ContractClient } from '@heynixie/contract';
import { planBackoffDelay } from '@heynixie/retry';
import { ORPCError } from '@orpc/client';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { isOutboxMessageStale } from './is-outbox-message-stale';
import { loadOutboxImages } from './load-outbox-images';
import type { StartTimer } from './start-platform-timer';
import { startPlatformTimer } from './start-platform-timer';
import type { OutboxMessage } from './types';
import { updateDiscardedOutboxIDs } from './update-discarded-outbox-ids';
import { useNixieClient } from './use-nixie-client';
import { useStoredOutbox } from './use-stored-outbox';

// A held message waited too long to go on its own, and waits for you to send or discard it.
export interface OutboxEntry {
  readonly message: OutboxMessage;
  readonly status: 'failed' | 'held' | 'sending' | 'sent';

  // the failed sends in a row that the API did not answer, which the next try backs off by
  readonly failures?: number | undefined;

  // when the next try goes on its own, for a failed send that retries by itself
  readonly retryAt?: number | undefined;
}

export interface OutboxOptions {
  // Times the pause before each retry. The platform timer by default.
  readonly startTimer?: StartTimer;

  // The time in milliseconds since the epoch. The platform clock by default.
  readonly now?: () => number;

  // when the latest reset the conversation shows ran, which removed every message written before it
  readonly resetAt?: Date | undefined;
}

// Keeps the messages this device sent until the conversation shows them, or a reset removes them.
// An unconfirmed message stays in device storage and goes again with its first client message ID;
// a confirmed one stays in memory until its record arrives.
export function useOutbox(
  forgottenClientMessageIDs: readonly string[],
  options: OutboxOptions = {},
) {
  const client = useNixieClient().client;
  const startTimer = options.startTimer ?? startPlatformTimer;
  const now = options.now ?? Date.now;
  const resetAt = options.resetAt;
  const [entries, setEntries] = useState<readonly OutboxEntry[]>([]);
  const [discarded, setDiscarded] = useState<readonly string[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const retries = useRef(new Map<string, () => void>());

  // whether the page still shows the outbox, so a send that ends after it goes starts no retry
  const isMounted = useRef(false);

  // the messages you chose to send, which keep retrying on their own whatever their age
  const chosen = useRef(new Set<string>());

  // the messages this tab forgot or discarded, which a send still waiting its turn never sends
  const removedIDs = useRef(new Set<string>());

  // the entries as the last render saw them, which a retry reads when its pause ends
  const latest = useRef(entries);

  useLayoutEffect(() => {
    latest.current = entries;
  }, [entries]);

  const stopRetry = useCallback((clientMessageID: string) => {
    retries.current.get(clientMessageID)?.();
    retries.current.delete(clientMessageID);
  }, []);

  // the send that the latest render made, which a retry calls when its pause ends
  const sendLatest = useRef<(message: OutboxMessage) => Promise<void>>(() => Promise.resolve());

  // An automatic try sends a message under 2 minutes old, or one you chose to send, and holds any
  // other for you to send or discard.
  const retryOnItsOwn = useCallback(
    (clientMessageID: string): void => {
      const entry = findEntry(latest.current, clientMessageID);

      if (!isMounted.current || entry?.status !== 'failed') {
        return;
      }

      if (chosen.current.has(clientMessageID) || !isOutboxMessageStale(entry.message, now())) {
        void sendLatest.current(entry.message);
      } else {
        setEntries((current) =>
          updateEntry(current, clientMessageID, { retryAt: undefined, status: 'held' }),
        );
      }
    },
    [now],
  );

  // Sends wait their turn, so the API writes the messages in the order you sent them. Each send
  // reads back first any images the page could not read when it loaded the message. A send the API
  // did not answer tries again on its own after a pause that grows with each failure in a row.
  const sendEntry = useCallback(
    (message: OutboxMessage): Promise<void> => {
      const clientMessageID = message.clientMessageId;

      stopRetry(clientMessageID);

      setEntries((current) =>
        updateEntry(current, clientMessageID, { retryAt: undefined, status: 'sending' }),
      );

      const previous = queue.current;

      queue.current = (async () => {
        await previous;

        const loaded = await loadOutboxImages(message);

        // the turn can come late, so the send checks again that no tab discarded the message, and
        // that it is still fresh or one you chose to send
        if (
          removedIDs.current.has(clientMessageID) ||
          updateDiscardedOutboxIDs().includes(clientMessageID)
        ) {
          return;
        }

        if (!chosen.current.has(clientMessageID) && isOutboxMessageStale(loaded, now())) {
          setEntries((current) =>
            updateEntry(current, clientMessageID, { retryAt: undefined, status: 'held' }),
          );

          return;
        }

        const outcome = await trySendMessage(client, loaded);

        if (outcome !== 'unanswered') {
          setEntries((current) =>
            updateEntry(current, clientMessageID, {
              failures: undefined,
              status: outcome === 'sent' ? 'sent' : 'failed',
            }),
          );

          return;
        }

        const failures = (findEntry(latest.current, clientMessageID)?.failures ?? 0) + 1;
        const delay = planBackoffDelay(failures, retrySchedule);

        setEntries((current) =>
          updateEntry(current, clientMessageID, {
            failures,
            retryAt: now() + delay,
            status: 'failed',
          }),
        );

        // a message that left the outbox, or an outbox that left the page, tries no more
        if (isMounted.current && findEntry(latest.current, clientMessageID) !== undefined) {
          retries.current.set(
            clientMessageID,
            startTimer(() => {
              retries.current.delete(clientMessageID);

              retryOnItsOwn(clientMessageID);
            }, delay),
          );
        }
      })();

      return queue.current;
    },
    [client, now, retryOnItsOwn, startTimer, stopRetry],
  );

  useLayoutEffect(() => {
    sendLatest.current = sendEntry;
  }, [sendEntry]);

  // A new message takes the browser's time zone and the time as you write it, and keeps both
  // through every retry.
  const add = useCallback(
    (written: Omit<OutboxMessage, 'timeZone' | 'writtenAt'>) => {
      const message = {
        ...written,
        timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
        writtenAt: new Date(now()).toISOString(),
      };

      setEntries((current) => [...current, { message, status: 'sending' }]);
      void sendEntry(message);
    },
    [now, sendEntry],
  );

  // a retry or a send you choose goes at once, and keeps retrying on its own whatever its age
  const retry = useCallback(
    (message: OutboxMessage): Promise<void> => {
      chosen.current.add(message.clientMessageId);

      return sendEntry(message);
    },
    [sendEntry],
  );

  // A discarded message leaves memory and device storage, with its images, as a forgotten one does.
  // The shared discard list keeps every other tab from storing it again.
  const discard = useCallback(
    (clientMessageID: string) => {
      stopRetry(clientMessageID);

      removedIDs.current.add(clientMessageID);

      setDiscarded(updateDiscardedOutboxIDs(clientMessageID));
    },
    [stopRetry],
  );

  // a message that another tab discarded leaves this tab too
  useEffect(() => {
    const readDiscards = (): void => {
      const listed = updateDiscardedOutboxIDs();

      setDiscarded((current) =>
        listed.every((clientMessageID) => current.includes(clientMessageID))
          ? current
          : [...new Set([...current, ...listed])],
      );
    };

    globalThis.addEventListener('storage', readDiscards);

    return () => {
      globalThis.removeEventListener('storage', readDiscards);
    };
  }, []);

  // a reset removed the messages written before it, so they leave as a forgotten message does
  const removed = useMemo(
    () => [
      ...forgottenClientMessageIDs,
      ...discarded,
      ...(resetAt === undefined
        ? []
        : entries
            .filter((entry) => isWrittenBefore(entry.message, resetAt))
            .map((entry) => entry.message.clientMessageId)),
    ],
    [discarded, entries, forgottenClientMessageIDs, resetAt],
  );

  useStoredOutbox({
    entries,
    forgottenClientMessageIDs: removed,
    now,
    sendEntry,
    setEntries,
  });

  // A forgotten message goes from memory before the page paints, so its text never shows again as
  // a sent message; the stored outbox keeps it out of storage, so a reload never sends it.
  useLayoutEffect(() => {
    if (removed.length === 0) {
      return;
    }

    const gone = new Set(removed);

    for (const clientMessageID of gone) {
      removedIDs.current.add(clientMessageID);

      stopRetry(clientMessageID);
    }

    setEntries((current) =>
      current.some((entry) => gone.has(entry.message.clientMessageId))
        ? current.filter((entry) => !gone.has(entry.message.clientMessageId))
        : current,
    );
  }, [removed, stopRetry]);

  // A browser that comes back online, or a page that becomes visible again, retries at once each
  // send waiting out its pause: a phone that slept may have missed the moment the API came back.
  useEffect(() => {
    const drainRetries = (): void => {
      for (const [clientMessageID, stop] of retries.current) {
        stop();

        retries.current.delete(clientMessageID);

        retryOnItsOwn(clientMessageID);
      }
    };

    const onVisibilityChange = (): void => {
      if (globalThis.document.visibilityState === 'visible') {
        drainRetries();
      }
    };

    globalThis.addEventListener('online', drainRetries);
    globalThis.document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      globalThis.removeEventListener('online', drainRetries);
      globalThis.document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [retryOnItsOwn]);

  // the page that goes away takes its pending retries with it
  useEffect(() => {
    const pending = retries.current;

    isMounted.current = true;

    return () => {
      isMounted.current = false;

      for (const stop of pending.values()) {
        stop();
      }

      pending.clear();
    };
  }, []);

  return { add, discard, entries, retry };
}

// The pause before the first retry, doubling with each failure in a row up to a minute.
const retrySchedule = { firstMs: 2000, maxMs: 60_000 };

// A message stored before the outbox kept when you wrote it predates every reset.
function isWrittenBefore(message: OutboxMessage, date: Date): boolean {
  const writtenAt = message.writtenAt === undefined ? Number.NaN : Date.parse(message.writtenAt);

  return Number.isNaN(writtenAt) || writtenAt < date.getTime();
}

function findEntry(
  entries: readonly OutboxEntry[],
  clientMessageID: string,
): OutboxEntry | undefined {
  return entries.find((entry) => entry.message.clientMessageId === clientMessageID);
}

function updateEntry(
  entries: readonly OutboxEntry[],
  clientMessageID: string,
  change: Partial<Omit<OutboxEntry, 'message'>>,
): readonly OutboxEntry[] {
  return entries.map((entry) =>
    entry.message.clientMessageId === clientMessageID ? { ...entry, ...change } : entry,
  );
}

// A send the API refused, such as one for a thread that ended, fails until you retry it; a send the
// API did not answer, because the network or the server is down, retries on its own.
async function trySendMessage(
  client: ContractClient,
  message: OutboxMessage,
): Promise<'refused' | 'sent' | 'unanswered'> {
  // a send without the images would write the message without them under its ID for good
  if (message.unreadImages !== undefined) {
    return 'refused';
  }

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
      ...(message.writtenAt === undefined ? {} : { writtenAt: message.writtenAt }),
      ...(message.images === undefined ? {} : { images: [...message.images] }),
    });

    return 'sent';
  } catch (error) {
    return error instanceof ORPCError && error.status >= 400 && error.status < 500
      ? 'refused'
      : 'unanswered';
  }
}
