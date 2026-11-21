import type { ContractClient, DeviceEvent } from '@heynixie/contract';
import { ORPCError } from '@orpc/client';
import { pickReconnectDelay } from '../conversation/pick-reconnect-delay';
import type { StartTimer } from '../utils/start-platform-timer';

export interface DeviceSubscription {
  readonly client: ContractClient;
  readonly pixels: { readonly width: number; readonly height: number };

  readonly onConnection: (state: 'open' | 'lost' | 'refused') => void;
  readonly onEvent: (event: DeviceEvent) => void;

  readonly signal: AbortSignal;
  readonly startTimer: StartTimer;
}

// Follows the device's stream until the signal aborts, and opens it again after a break with the
// size of the screen, because the server learns that size from each stream. A refusal of the
// session ends the loop: a revoked device never gets in again.
export async function subscribeToDeviceEvents(options: DeviceSubscription): Promise<void> {
  const state = { failures: 0 };

  while (!options.signal.aborted) {
    const outcome = await readDeviceStream(options);

    if (outcome === 'refused') {
      options.onConnection('refused');

      return;
    }

    state.failures = outcome === 'connected' ? 0 : state.failures + 1;

    options.onConnection('lost');

    await waitForDelay(pickReconnectDelay(state.failures), options.startTimer, options.signal);
  }
}

type StreamOutcome = 'connected' | 'failed' | 'refused';

async function readDeviceStream(options: DeviceSubscription): Promise<StreamOutcome> {
  const state = { isConnected: false };

  try {
    const events = await options.client.devices.follow(
      { pixels: options.pixels },
      { signal: options.signal },
    );

    for await (const event of events) {
      state.isConnected = true;

      options.onConnection('open');
      options.onEvent(event);
    }

    return 'connected';
  } catch (error) {
    if (state.isConnected) {
      return 'connected';
    }

    return error instanceof ORPCError && error.code === 'UNAUTHORIZED' ? 'refused' : 'failed';
  }
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
