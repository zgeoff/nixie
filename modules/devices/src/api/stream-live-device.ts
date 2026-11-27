import type { APIContext } from '@heynixie/api';
import { verifySessionToken } from '@heynixie/api';
import type { DeviceEvent } from '@heynixie/contract';
import { toErrorFields } from '@heynixie/logger';
import type { DeviceStreams } from '../stream/create-device-streams';
import { followDevice } from '../stream/follow-device';
import type { Device, ScreenPixels } from '../types';

export interface DeviceStream {
  readonly device: Device;
  readonly token: string | undefined;

  // true for a session that only listens, which an open stream keeps from lapsing
  readonly isKeptActive: boolean;
  readonly pixels: ScreenPixels;
  readonly signal: AbortSignal | undefined;
}

type DeviceStreamEvent =
  | { readonly kind: 'opened' }
  | { readonly kind: 'device'; readonly event: DeviceEvent };

// The events of a device screen's stream: opened once its device stream is open, then what the
// screen shows and each change. An open stream keeps a device session active, so a panel that only
// listens never lapses, and leaves a full session's last seen time to its own calls. A device that a revoke removes ends the stream.
export async function* streamLiveDevice(
  streams: DeviceStreams,
  context: APIContext,
  stream: DeviceStream,
): AsyncGenerator<DeviceStreamEvent, void, undefined> {
  const keepActive = stream.isKeptActive
    ? setInterval(() => {
        void writeKeepActive(context, stream);
      }, context.settings.lastSeenIntervalMs)
    : null;

  const stopKeepActive = (): void => {
    if (keepActive !== null) {
      clearInterval(keepActive);
    }
  };

  // A consumer that stops reading after an abort never resumes the generator, so its finally may
  // never run: the abort ends the interval too, and so does a signal that aborted already.
  if (stream.signal?.aborted === true) {
    stopKeepActive();
  } else {
    stream.signal?.addEventListener('abort', stopKeepActive, { once: true });
  }

  const events = followDevice({
    log: context.log,
    clock: context.clock,
    streams,
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
