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

export interface OutboxEntry {
  readonly message: OutboxMessage;
  readonly status: 'failed' | 'held' | 'sending' | 'sent';

  readonly failures?: number | undefined;

  readonly retryAt?: number | undefined;

  readonly sequence?: number | undefined;
}

export interface OutboxOptions {
  readonly startTimer?: StartTimer;

  readonly now?: () => number;

  readonly resetSequence?: number | undefined;
}

const retrySchedule = { firstMs: 2000, maxMs: 60_000 };

export function useOutbox(
  forgottenClientMessageIDs: readonly string[],
  options: OutboxOptions = {},
) {
  const client = useNixieClient().client;
  const startTimer = options.startTimer ?? startPlatformTimer;
  const now = options.now ?? Date.now;
  const resetSequence = options.resetSequence;
  const [entries, setEntries] = useState<readonly OutboxEntry[]>([]);
  const [discarded, setDiscarded] = useState<readonly string[]>([]);
  const [resetIDs, setResetIDs] = useState<readonly string[]>([]);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const retries = useRef(new Map<string, () => void>());
  const isMounted = useRef(false);
  const chosen = useRef(new Set<string>());
  const removedIDs = useRef(new Set<string>());
  const latest = useRef(entries);

  useLayoutEffect(() => {
    latest.current = entries;
  }, [entries]);

  const stopRetry = useCallback((clientMessageID: string) => {
    retries.current.get(clientMessageID)?.();
    retries.current.delete(clientMessageID);
  }, []);

  const sendLatest = useRef<(message: OutboxMessage) => Promise<void>>(() => Promise.resolve());

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

        if (outcome.status !== 'unanswered') {
          setEntries((current) =>
            updateEntry(current, clientMessageID, {
              failures: undefined,
              sequence: outcome.sequence,
              status: outcome.status === 'sent' ? 'sent' : 'failed',
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

  const retry = useCallback(
    (message: OutboxMessage): Promise<void> => {
      chosen.current.add(message.clientMessageId);

      return sendEntry(message);
    },
    [sendEntry],
  );

  const discard = useCallback(
    (clientMessageID: string) => {
      stopRetry(clientMessageID);

      removedIDs.current.add(clientMessageID);

      setDiscarded(updateDiscardedOutboxIDs(clientMessageID));
    },
    [stopRetry],
  );

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

  useLayoutEffect(() => {
    if (resetSequence === undefined) {
      return;
    }

    const before = latest.current.filter(
      (entry) => entry.sequence === undefined || entry.sequence < resetSequence,
    );

    if (before.length > 0) {
      setResetIDs((current) => [
        ...current,
        ...before.map((entry) => entry.message.clientMessageId),
      ]);
    }
  }, [resetSequence]);

  const removed = useMemo(
    () => [...forgottenClientMessageIDs, ...discarded, ...resetIDs],
    [discarded, forgottenClientMessageIDs, resetIDs],
  );

  useStoredOutbox({
    entries,
    forgottenClientMessageIDs: removed,
    now,
    sendEntry,
    setEntries,
  });

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

  // A phone that slept may have missed the moment the API came back, so a wake retries each paused
  // send at once.
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

type SendOutcome =
  | { readonly sequence: number; readonly status: 'sent' }
  | { readonly sequence?: undefined; readonly status: 'refused' | 'unanswered' };

async function trySendMessage(
  client: ContractClient,
  message: OutboxMessage,
): Promise<SendOutcome> {
  if (message.unreadImages !== undefined) {
    return { status: 'refused' };
  }

  try {
    const sent = await client.conversation.send({
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

    return { sequence: sent.sequence, status: 'sent' };
  } catch (error) {
    return {
      status:
        error instanceof ORPCError && error.status >= 400 && error.status < 500
          ? 'refused'
          : 'unanswered',
    };
  }
}
