import type { ContractClient } from '@heynixie/contract';
import type { RefObject } from 'react';
import { useEffect } from 'react';
import { startPlatformTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';
import { pickPixelsToSend } from './pick-pixels-to-send';
import type { ScreenPixels } from './read-screen-pixels';
import { readScreenPixels } from './read-screen-pixels';

const resizeDelayMs = 250;

interface ResizeState {
  stop: (() => void) | null;
  isInFlight: boolean;
  hasPendingEvent: boolean;
  isClosed: boolean;
}

// At most one resize call every 250 ms and one at a time. A resize event during a call sends the
// size again once it settles, and a failed call leaves the ref as it was.
export function useScreenResize(isActive: boolean, serverPixels: RefObject<ScreenPixels>): void {
  const nixie = useNixieClient();

  useEffect(() => {
    if (!isActive) {
      return () => {};
    }

    const state: ResizeState = {
      stop: null,
      isInFlight: false,
      hasPendingEvent: false,
      isClosed: false,
    };

    const sendSize = async (): Promise<void> => {
      state.stop = null;

      if (state.isInFlight) {
        state.hasPendingEvent = true;

        return;
      }

      const pixels = pickPixelsToSend(serverPixels.current, readScreenPixels());

      if (pixels === null) {
        return;
      }

      state.isInFlight = true;
      state.hasPendingEvent = false;

      await writeResize(nixie.client, pixels, serverPixels);

      state.isInFlight = false;

      if (state.hasPendingEvent && !state.isClosed) {
        await sendSize();
      }
    };

    const handleResize = (): void => {
      state.stop ??= startPlatformTimer(() => {
        void sendSize();
      }, resizeDelayMs);
    };

    globalThis.addEventListener('resize', handleResize);

    return () => {
      state.isClosed = true;

      globalThis.removeEventListener('resize', handleResize);
      state.stop?.();
    };
  }, [isActive, nixie.client, serverPixels]);
}

async function writeResize(
  client: ContractClient,
  pixels: ScreenPixels,
  serverPixels: RefObject<ScreenPixels>,
): Promise<void> {
  const before = serverPixels.current;

  try {
    await client.devices.resize(pixels);

    // a reconnect while the call was in flight sent its own size, which is what the server keeps
    if (serverPixels.current === before) {
      serverPixels.current = pixels;
    }
  } catch {
    // the server keeps its old size, so the next resize event sends the size again
  }
}
