import { followDevice } from '@heynixie/devices';
import type { Device, LayoutState, ScreenPixels, ScreenState } from '@heynixie/devices';
import { verifySessionToken } from '../session/verify-session-token';
import type { APIContext } from '../types';

interface DeviceStream {
  readonly device: Device;
  readonly token: string | undefined;
  readonly pixels: ScreenPixels;
  readonly signal: AbortSignal | undefined;
}

// The events of a device's stream. An open stream keeps its session active, so a panel that only
// listens never lapses.
export async function* streamDeviceEvents(
  context: APIContext,
  stream: DeviceStream,
): AsyncGenerator<ScreenState | LayoutState, void, undefined> {
  const keepActive = setInterval(() => {
    void verifySessionToken(context, stream.token);
  }, context.settings.lastSeenIntervalMs);

  try {
    yield* followDevice({
      log: context.log,
      clock: context.clock,
      streams: context.devices,
      deviceID: stream.device.deviceID,
      pixels: stream.pixels,
      signal: stream.signal,
    });
  } finally {
    clearInterval(keepActive);
  }
}
