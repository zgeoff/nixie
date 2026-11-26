import type { DeviceEvent } from '@heynixie/contract';
import type { Device, ScreenPixels } from '@heynixie/devices';
import { followDevice } from '@heynixie/devices';
import { toErrorFields } from '@heynixie/logger';
import { verifySessionToken } from '../session/verify-session-token';
import type { APIContext } from '../types';

export interface DeviceStream {
  readonly device: Device;
  readonly token: string | undefined;
  readonly pixels: ScreenPixels;
  readonly signal: AbortSignal | undefined;
}

type DeviceStreamEvent =
  | { readonly kind: 'opened' }
  | { readonly kind: 'device'; readonly event: DeviceEvent };

// The events of a device screen's stream: opened once its device stream is open, then what the
// screen shows and each change. An open stream keeps its session active, so a panel that only
// listens never lapses. A device that a revoke removes ends the stream.
export async function* streamLiveDevice(
  context: APIContext,
  stream: DeviceStream,
): AsyncGenerator<DeviceStreamEvent, void, undefined> {
  const keepActive = setInterval(() => {
    void writeKeepActive(context, stream);
  }, context.settings.lastSeenIntervalMs);

  const stopKeepActive = (): void => {
    clearInterval(keepActive);
  };

  // A consumer that stops reading after an abort never resumes the generator, so its finally may
  // never run: the abort ends the interval too, and so does a signal that aborted already.
  stream.signal?.addEventListener('abort', stopKeepActive, { once: true });

  if (stream.signal?.aborted === true) {
    stopKeepActive();
  }

  const events = followDevice({
    log: context.log,
    clock: context.clock,
    streams: context.clients.devices,
    deviceID: stream.device.deviceID,
    pixels: stream.pixels,
    signal: stream.signal,
  });

  try {
    // followDevice opens the device stream before its first event
    const first = await events.next();

    yield { kind: 'opened' };

    if (first.done === true) {
      return;
    }

    yield { kind: 'device', event: first.value };

    for await (const event of events) {
      yield { kind: 'device', event };
    }
  } finally {
    stream.signal?.removeEventListener('abort', stopKeepActive);
    stopKeepActive();

    await events.return(undefined);
  }
}

async function writeKeepActive(context: APIContext, stream: DeviceStream): Promise<void> {
  try {
    await verifySessionToken(context, stream.token);
  } catch (error) {
    context.logger?.('live.keep_active_failed', {
      deviceID: stream.device.deviceID,
      ...toErrorFields(error),
    });
  }
}
