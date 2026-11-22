import type { ScreenPixels } from '../types';

export interface OpenDeviceStream {
  readonly close: () => void;
}

export interface DeviceStreams {
  readonly open: (deviceID: string, pixels: ScreenPixels) => OpenDeviceStream;

  // true while the device has at least one open stream
  readonly isOnline: (deviceID: string) => boolean;

  // the size the device's newest open stream sent, or null while it is offline
  readonly readPixels: (deviceID: string) => ScreenPixels | null;

  // gives every open stream of the device a new size, and does nothing while it is offline
  readonly resize: (deviceID: string, pixels: ScreenPixels) => void;
}

// The open streams of each device, which only this process knows: a restart drops them, and each
// device opens its stream again.
export function createDeviceStreams(): DeviceStreams {
  const open = new Map<string, { pixels: ScreenPixels }[]>();

  return {
    open: (deviceID, pixels) => {
      const stream = { pixels };

      open.set(deviceID, [...(open.get(deviceID) ?? []), stream]);

      return {
        close: () => {
          const rest = (open.get(deviceID) ?? []).filter((held) => held !== stream);

          if (rest.length === 0) {
            open.delete(deviceID);
          } else {
            open.set(deviceID, rest);
          }
        },
      };
    },
    isOnline: (deviceID) => (open.get(deviceID)?.length ?? 0) > 0,
    readPixels: (deviceID) => open.get(deviceID)?.at(-1)?.pixels ?? null,
    resize: (deviceID, pixels) => {
      for (const stream of open.get(deviceID) ?? []) {
        stream.pixels = pixels;
      }
    },
  };
}
