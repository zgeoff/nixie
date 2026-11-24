import type { ContractClient, LiveTopic, LogRecord } from '@heynixie/contract';
import { liveTopicSchema } from '@heynixie/contract';
import type { ReadonlyDeep } from '../types';
import type { StartTimer } from '../utils/start-platform-timer';
import { runLiveConnection } from './run-live-connection';

// The records of one thread on screen, from the sequence its page read at.
export interface LiveView {
  readonly thread: string;
  readonly afterSequence: number;
  readonly onRecord: (record: ReadonlyDeep<LogRecord>) => void;

  // runs on each open of the view's stream, a reconnect included
  readonly onOpened?: () => void;
}

export interface LiveFeed {
  // keeps the stream open until the returned function runs
  readonly retain: () => () => void;

  // keeps the stream open until the returned function runs, and sends the view the records of
  // its thread while it is the newest view
  readonly follow: (view: LiveView) => () => void;
  readonly isAvailable: () => boolean;
  readonly subscribeToAvailability: (onChange: () => void) => () => void;
}

export interface LiveFeedOptions {
  readonly client: ContractClient;
  readonly startTimer: StartTimer;

  // reads again every read under these topics
  readonly invalidate: (topics: readonly LiveTopic[]) => void;
}

const unavailableAfterFailures = 3;

interface Connection {
  readonly view: LiveView | null;
  readonly controller: AbortController;

  // the connection that this one replaces once it opens
  readonly replaces: Connection | null;

  // true while the connection holds an open stream, and false while it waits to try again
  isOpen: boolean;
}

interface FeedState {
  retained: number;
  views: LiveView[];
  live: Connection | null;
  starting: Connection | null;
  isAvailable: boolean;
  isReconcileQueued: boolean;
  stopFallback: (() => void) | null;
}

// The one stream of a tab: the newest view's thread, or no thread while no page shows one. A new
// view's stream opens beside the old one, which closes once the new one opens. A first open or a
// reconnect reads every topic again.
export function createLiveFeed(options: LiveFeedOptions): LiveFeed {
  const state: FeedState = {
    retained: 0,
    views: [],
    live: null,
    starting: null,
    isAvailable: true,
    isReconcileQueued: false,
    stopFallback: null,
  };

  const listeners = new Set<() => void>();

  const setAvailable = (isAvailable: boolean): void => {
    if (state.isAvailable === isAvailable) {
      return;
    }

    state.isAvailable = isAvailable;

    for (const listener of listeners) {
      listener();
    }

    if (isAvailable) {
      state.stopFallback?.();
      state.stopFallback = null;
    } else {
      state.stopFallback = startFallback(options);
    }
  };

  const open = (view: LiveView | null): void => {
    const connection: Connection = {
      view,
      controller: new AbortController(),
      replaces: state.live,
      isOpen: false,
    };

    state.starting = connection;

    void runLiveConnection({
      client: options.client,
      thread: view?.thread,
      afterSequence: view?.afterSequence,
      signal: connection.controller.signal,
      startTimer: options.startTimer,
      onOpened: (opening) => {
        // The old connection only covers what this one missed while its own stream is open.
        const isCovered = opening.isFirst && connection.replaces?.isOpen === true;

        connection.isOpen = true;

        setAvailable(true);

        if (state.starting === connection) {
          state.live?.controller.abort();
          state.live = connection;
          state.starting = null;
        }

        // A stream that replaces an open one has nothing to catch up. A first open that replaces
        // none, or one that replaces a connection waiting to try again, and each reconnect, read
        // every topic.
        if (!isCovered) {
          options.invalidate(liveTopicSchema.options);
        }

        view?.onOpened?.();
        queueReconcile();
      },
      onRecord: (record) => {
        view?.onRecord(record);
      },
      onChanged: options.invalidate,
      onAttempt: (failures) => {
        connection.isOpen = false;

        if (failures >= unavailableAfterFailures) {
          setAvailable(false);
        }
      },
    });
  };

  const reconcile = (): void => {
    state.isReconcileQueued = false;

    if (state.retained === 0) {
      state.starting?.controller.abort();
      state.live?.controller.abort();
      state.starting = null;
      state.live = null;

      return;
    }

    const wanted = state.views.at(-1) ?? null;

    if (state.starting !== null && state.starting.view !== wanted) {
      state.starting.controller.abort();

      state.starting = null;
    }

    if (state.starting === null && (state.live === null || state.live.view !== wanted)) {
      open(wanted);
    }
  };

  // Several changes in one commit of the page, such as a switch from one thread's page to
  // another's, reconcile once.
  const queueReconcile = (): void => {
    if (state.isReconcileQueued) {
      return;
    }

    state.isReconcileQueued = true;

    queueMicrotask(reconcile);
  };

  return {
    retain: () => {
      const hold = { isHeld: true };

      state.retained += 1;

      queueReconcile();

      return () => {
        if (hold.isHeld) {
          hold.isHeld = false;
          state.retained -= 1;

          queueReconcile();
        }
      };
    },
    follow: (view) => {
      state.views = [...state.views, view];
      state.retained += 1;

      queueReconcile();

      return () => {
        if (state.views.includes(view)) {
          state.views = state.views.filter((held) => held !== view);
          state.retained -= 1;

          queueReconcile();
        }
      };
    },
    isAvailable: () => state.isAvailable,
    subscribeToAvailability: (onChange) => {
      listeners.add(onChange);

      return () => {
        listeners.delete(onChange);
      };
    },
  };
}

// While live updates are unavailable, the client reads each topic again on this period.
export const liveFallbackMs = 60_000;

// Reads every topic again each period until the returned function stops it.
function startFallback(options: LiveFeedOptions): () => void {
  const state = { stop: (): void => {}, isStopped: false };

  const arm = (): void => {
    state.stop = options.startTimer(() => {
      if (state.isStopped) {
        return;
      }

      options.invalidate(liveTopicSchema.options);

      arm();
    }, liveFallbackMs);
  };

  arm();

  return () => {
    state.isStopped = true;

    state.stop();
  };
}
