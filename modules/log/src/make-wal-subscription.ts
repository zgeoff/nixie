import { systemClock } from '@heynixie/clock';
import { subscribeToWAL } from './subscribe-to-wal';
import type { SubscribeToChanges, Writer } from './types';

export interface WALSubscriptionOptions {
  readonly pollMs?: number;
}

const DEFAULT_POLL_MS = 1000;

export function makeWALSubscription(
  writer: Pick<Writer, 'clock' | 'dataDir'>,
  options: WALSubscriptionOptions = {},
): SubscribeToChanges {
  return (onChange) => {
    // The settle delays wait for SQLite to publish a commit, which a test clock cannot hurry, so
    // they run on the system clock.
    const unsubscribe = subscribeToWAL(writer.dataDir, systemClock, onChange);

    const poll = new AbortController();

    void startPoll(
      writer.clock,
      { pollMs: options.pollMs ?? DEFAULT_POLL_MS, signal: poll.signal },
      onChange,
    );

    return () => {
      poll.abort();

      unsubscribe();
    };
  };
}

interface Poll {
  readonly pollMs: number;
  readonly signal: AbortSignal;
}

async function startPoll(clock: Writer['clock'], poll: Poll, onPoll: () => void): Promise<void> {
  while (!poll.signal.aborted) {
    await clock.sleep(poll.pollMs, poll.signal);

    if (!poll.signal.aborted) {
      onPoll();
    }
  }
}
