import { match } from 'ts-pattern';
import type { StartTimer } from '../utils/start-platform-timer';
import type { DeviceFeed } from './create-device-feed';
import type { DeviceRelayMessage } from './parse-device-relay-message';
import { parseDeviceRelayMessage } from './parse-device-relay-message';
import type { RelayAction } from './pick-relay-actions';
import { pickRelayActions } from './pick-relay-actions';

interface DeviceLockOptions {
  readonly signal: AbortSignal;
}

export interface DeviceLocks {
  readonly request: (
    name: string,
    options: DeviceLockOptions,
    onGranted: () => Promise<void>,
  ) => Promise<unknown>;
}

// the channel that every tab of the browser opens under one name, such as a BroadcastChannel
export interface DeviceChannel {
  readonly send: (message: DeviceRelayMessage) => void;
  readonly listen: (onMessage: (data: unknown) => void) => void;
  readonly close: () => void;
}

export interface DeviceLeaderOptions {
  // this tab's ID, which settles which of two tabs that take the stream at once keeps it
  readonly tab: string;
  readonly locks: DeviceLocks | null | undefined;

  // null where the browser has no channel between its tabs
  readonly openChannel: ((name: string) => DeviceChannel) | null;
  readonly startTimer: StartTimer;
}

const channelName = 'nixie-device-stream';

// One tab of the browser holds the device stream and sends what it shows to every other tab. A
// browser lock picks that tab, or, with no lock manager, the tabs pick one over the channel. A
// browser with no channel between its tabs holds a stream in each.
export function holdDeviceStreamAsLeader(
  feed: DeviceFeed,
  options: DeviceLeaderOptions,
): () => void {
  if (options.openChannel === null) {
    return feed.retain();
  }

  const channel = options.openChannel(channelName);
  const relay = createRelay(feed, channel, options);

  channel.listen(relay.hear);
  channel.send({ kind: 'join' });

  const stopElection =
    options.locks === undefined || options.locks === null
      ? relay.electByChannel()
      : relay.electByLock(options.locks);

  const state = { isStopped: false };

  return () => {
    if (state.isStopped) {
      return;
    }

    state.isStopped = true;

    stopElection();

    relay.resign();
    channel.close();
  };
}

interface RelayState {
  isLeading: boolean;
  canYield: boolean;
  isHeard: boolean;
  release: (() => void) | null;
  stopTimer: (() => void) | null;
  elect: () => void;
}

// how long a tab waits for a holder to answer before it takes the stream itself
const claimDelayMs = 200;

// how often a tab that holds no stream checks that its holder is still there, such as after the
// holder's tab crashed
const probeIntervalMs = 5000;

function createRelay(feed: DeviceFeed, channel: DeviceChannel, options: DeviceLeaderOptions) {
  const state: RelayState = {
    isLeading: false,
    canYield: true,
    isHeard: false,
    release: null,
    stopTimer: null,
    elect: () => {},
  };

  const announce = (): void => {
    channel.send({ kind: 'leader', tab: options.tab, events: feed.getSnapshot() });
  };

  const lead = (): void => {
    if (state.isLeading) {
      return;
    }

    state.isLeading = true;

    const releaseStream = feed.retain();
    const unsubscribe = feed.subscribe(announce);

    state.release = () => {
      unsubscribe();
      releaseStream();
    };

    announce();
  };

  const stepDown = (): void => {
    state.isLeading = false;
    state.release?.();
    state.release = null;
  };

  const act = (action: RelayAction): void => {
    match(action)
      .with({ kind: 'announce' }, announce)
      .with({ kind: 'answer' }, () => {
        channel.send({ kind: 'here', tab: options.tab });
      })
      .with({ kind: 'stepDown' }, stepDown)
      .with({ kind: 'heard' }, () => {
        state.isHeard = true;
      })
      .with({ kind: 'mirror' }, (mirror) => {
        feed.mirror(mirror.events);
      })
      .with({ kind: 'elect' }, () => {
        state.elect();
      })
      .exhaustive();
  };

  // Each probe gives the holder a moment to answer, and a tab that hears nothing takes the stream.
  const runProbe = (): void => {
    state.stopTimer?.();

    if (!state.isLeading) {
      state.isHeard = false;

      channel.send({ kind: 'probe' });
    }

    state.stopTimer = options.startTimer(() => {
      if (!state.isLeading && !state.isHeard) {
        lead();
      }

      state.stopTimer = options.startTimer(runProbe, probeIntervalMs);
    }, claimDelayMs);
  };

  return {
    hear: (data: unknown): void => {
      const message = parseDeviceRelayMessage(data);

      if (message === null) {
        return;
      }

      const role = { tab: options.tab, isLeading: state.isLeading, canYield: state.canYield };

      for (const action of pickRelayActions(message, role)) {
        act(action);
      }
    },
    electByChannel: (): (() => void) => {
      state.elect = runProbe;

      runProbe();

      return () => {
        state.stopTimer?.();
        state.stopTimer = null;
      };
    },
    electByLock: (locks: DeviceLocks): (() => void) => {
      state.canYield = false;

      const controller = new AbortController();

      const gate = Promise.withResolvers<void>();

      void runWhileLeading(locks, controller.signal, gate.promise, { lead, stepDown });

      return () => {
        controller.abort();
        gate.resolve();
      };
    },
    resign: (): void => {
      if (!state.isLeading) {
        return;
      }

      stepDown();

      channel.send({ kind: 'resign', tab: options.tab });
    },
  };
}

const lockName = 'nixie-device-stream';

interface Leading {
  readonly lead: () => void;
  readonly stepDown: () => void;
}

async function runWhileLeading(
  locks: DeviceLocks,
  signal: AbortSignal,
  isGivenUp: Promise<void>,
  leading: Leading,
): Promise<void> {
  try {
    await locks.request(lockName, { signal }, async () => {
      leading.lead();

      await isGivenUp;

      leading.stepDown();
    });
  } catch {
    // a tab that closes before it is granted the lock ends its request with an abort
  }
}
