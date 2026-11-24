import type { LiveTopic } from '@heynixie/contract';

const bus = new EventTarget();

const changedType = 'changed';

// What the mock API's live streams have done, so a browser suite reads how the page opened them
const openedThreads: (string | undefined)[] = [];

// a stream that closes after a reset belongs to the generation before it, and counts for nothing
const streams = { opened: 0, closed: 0, generation: 0, peak: 0 };

export const mockLive = {
  get openCount(): number {
    return streams.opened - streams.closed;
  },

  // the most streams open at once since the last reset
  get peakOpenCount(): number {
    return streams.peak;
  },
  get openedThreads(): readonly (string | undefined)[] {
    return openedThreads;
  },

  // answers the generation to pass to recordClose
  recordOpen: (thread: string | undefined): number => {
    streams.opened += 1;
    streams.peak = Math.max(streams.peak, streams.opened - streams.closed);

    openedThreads.push(thread);

    return streams.generation;
  },
  recordClose: (generation: number): void => {
    if (generation === streams.generation) {
      streams.closed += 1;
    }
  },
  reset: (): void => {
    streams.generation += 1;
    streams.opened = 0;
    streams.closed = 0;
    streams.peak = 0;
    openedThreads.length = 0;
  },
};

// Tells every open live stream of the mock API that a read under these topics changed.
export function publishMockChanged(topics: readonly LiveTopic[]): void {
  bus.dispatchEvent(new CustomEvent(changedType, { detail: topics }));
}

export function subscribeToMockChanged(
  onChanged: (topics: readonly LiveTopic[]) => void,
  signal: AbortSignal | undefined,
): void {
  const listener = (event: Event): void => {
    if (event instanceof CustomEvent) {
      onChanged(event.detail);
    }
  };

  bus.addEventListener(changedType, listener);

  signal?.addEventListener('abort', () => {
    bus.removeEventListener(changedType, listener);
  });
}
