import type { ContractClient, LogRecord } from '@heynixie/contract';
import { isDefinedError } from '@orpc/client';
import { pickReconnectDelay } from './pick-reconnect-delay';
import type { StartTimer } from './start-platform-timer';
import type { ReadonlyDeep } from './types';

export interface SubscribeOptions {
  readonly afterSequence: number;
  readonly client: ContractClient;

  readonly onAvailability: (isAvailable: boolean) => void;
  readonly onRecord: (record: ReadonlyDeep<LogRecord>) => void;

  readonly signal: AbortSignal;

  readonly startTimer: StartTimer;
  readonly thread?: string;
}

const unavailableAfterFailures = 3;

export async function subscribeToLiveRecords(options: SubscribeOptions): Promise<void> {
  const state = { after: options.afterSequence, failures: 0 };

  while (!options.signal.aborted) {
    const wake = startWakeWatch(options.signal);

    const attempt = await readRecordStream(options, state.after, wake.signal);

    state.after = attempt.after;
    state.failures = attempt.connected ? 0 : state.failures + 1;

    if (state.failures >= unavailableAfterFailures) {
      options.onAvailability(false);
    }

    await waitForDelay(pickReconnectDelay(state.failures), options.startTimer, wake.signal);

    wake.stop();
  }
}

interface WakeWatch {
  readonly signal: AbortSignal;
  readonly stop: () => void;
}

// A phone that slept can hold a dead connection that no error reports, so a page that becomes
// visible again, or a browser that comes back online, follows again at once.
function startWakeWatch(outer: AbortSignal): WakeWatch {
  const controller = new AbortController();

  const stop = (): void => {
    outer.removeEventListener('abort', stopOnAbort);
    globalThis.removeEventListener('online', stopOnWake);
    globalThis.document.removeEventListener('visibilitychange', stopOnWake);
  };

  const stopOnAbort = (): void => {
    controller.abort();
  };

  const stopOnWake = (): void => {
    if (globalThis.document.visibilityState === 'visible') {
      controller.abort();
    }
  };

  outer.addEventListener('abort', stopOnAbort, { once: true });
  globalThis.addEventListener('online', stopOnWake);
  globalThis.document.addEventListener('visibilitychange', stopOnWake);

  return { signal: controller.signal, stop };
}

interface Attempt {
  readonly after: number;

  readonly connected: boolean;
}

async function readRecordStream(
  options: SubscribeOptions,
  afterSequence: number,
  signal: AbortSignal,
): Promise<Attempt> {
  const events = await tryStartRecordStream(options, afterSequence, signal);

  if (events === undefined) {
    return { after: afterSequence, connected: false };
  }

  options.onAvailability(true);

  // The iterator stops a read in flight when it returns, even where an abort does not reach the
  // response body.
  signal.addEventListener('abort', () => void events.return(undefined), { once: true });

  return drainRecordStream(options, events, afterSequence);
}

type RecordEvents = Awaited<ReturnType<ContractClient['records']['follow']>>;

async function tryStartRecordStream(
  options: SubscribeOptions,
  afterSequence: number,
  signal: AbortSignal,
): Promise<RecordEvents | undefined> {
  try {
    return await options.client.records.follow(
      { afterSequence, ...(options.thread === undefined ? {} : { thread: options.thread }) },
      { signal },
    );
  } catch {
    return undefined;
  }
}

async function drainRecordStream(
  options: SubscribeOptions,

  events: RecordEvents,
  afterSequence: number,
): Promise<Attempt> {
  const state = { after: afterSequence };

  try {
    for await (const event of events) {
      state.after = event.record.sequence;

      options.onRecord(event.record);
    }
  } catch (error) {
    return { after: state.after, connected: !isDefinedError(error) };
  }

  return { after: state.after, connected: true };
}

async function waitForDelay(
  milliseconds: number,
  startTimer: StartTimer,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    return;
  }

  await new Promise<void>((resolve) => {
    const stop = startTimer(resolve, milliseconds);

    signal.addEventListener(
      'abort',
      () => {
        stop();
        resolve();
      },
      { once: true },
    );
  });
}
