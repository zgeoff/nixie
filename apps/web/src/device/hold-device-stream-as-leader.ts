import type { DeviceFeed } from './create-device-feed';

export interface DeviceLockOptions {
  readonly signal: AbortSignal;
}

export interface DeviceLocks {
  readonly request: (
    name: string,
    options: DeviceLockOptions,
    onGranted: () => Promise<void>,
  ) => Promise<unknown>;
}

// A browser keeps 6 connections to one HTTP/1.1 origin, so only one tab of the browser holds the
// device stream open while no tab shows the device view. The next waiting tab takes over when the
// holder closes. A page with no lock manager, such as one served over plain HTTP, holds its own.
export function holdDeviceStreamAsLeader(
  feed: DeviceFeed,
  locks: DeviceLocks | null | undefined,
): () => void {
  if (locks === undefined || locks === null) {
    return feed.retain();
  }

  const controller = new AbortController();

  const gate = Promise.withResolvers<void>();

  void runWhileLeading(locks, feed, controller.signal, gate.promise);

  return () => {
    controller.abort();
    gate.resolve();
  };
}

const lockName = 'nixie-device-stream';

async function runWhileLeading(
  locks: DeviceLocks,
  feed: DeviceFeed,
  signal: AbortSignal,
  isGivenUp: Promise<void>,
): Promise<void> {
  try {
    await locks.request(lockName, { signal }, async () => {
      const release = feed.retain();

      await isGivenUp;

      release();
    });
  } catch {
    // a tab that closes before it is granted the lock ends its request with an abort
  }
}
