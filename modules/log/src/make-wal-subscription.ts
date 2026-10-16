import { systemClock } from '@heynixie/clock';
import { subscribeToWAL } from './subscribe-to-wal';
import type { SubscribeToChanges, Writer } from './types';

export interface WALSubscriptionOptions {
  // the poll that covers a change the watcher misses, 1 s by default
  readonly pollMs?: number;
}

// Makes the change subscription for a reader in another process, which never sees the writer's
// commit bus: a change to nixie.db's WAL file, and a poll on the clock for a filesystem that
// cannot watch.
export function makeWALSubscription(
  writer: Pick<Writer, 'clock' | 'dataDir'>,
  options: WALSubscriptionOptions = {},
): SubscribeToChanges {
  return (onChange) => {
    // the settle delays wait for SQLite to publish a commit, which no test clock hurries, so they
    // run on the system clock; the poll runs on the writer's clock
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

const DEFAULT_POLL_MS = 1000;

interface Poll {
  readonly pollMs: number;
  readonly signal: AbortSignal;
}

// calls onPoll every pollMs on the clock until the signal aborts
async function startPoll(clock: Writer['clock'], poll: Poll, onPoll: () => void): Promise<void> {
  while (!poll.signal.aborted) {
    // oxlint-disable-next-line no-await-in-loop -- each poll waits out the last one's interval
    await clock.sleep(poll.pollMs, poll.signal);

    if (!poll.signal.aborted) {
      onPoll();
    }
  }
}
