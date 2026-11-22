import type { ContractClient } from '@heynixie/contract';
import { useEffect } from 'react';
import { startPlatformTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';
import { pickPixelsToSend } from './pick-pixels-to-send';
import type { ScreenPixels } from './read-screen-pixels';
import { readScreenPixels } from './read-screen-pixels';

const resizeDelayMs = 250;

// Tells the server the new size of the screen after the window resizes: at most one call every
// 250 ms, and none when the size is what the server last got.
export function useScreenResize(isActive: boolean): void {
  const nixie = useNixieClient();

  useEffect(() => {
    if (!isActive) {
      return () => {};
    }

    const state: { sent: ScreenPixels; stop: (() => void) | null } = {
      sent: readScreenPixels(),
      stop: null,
    };

    const sendSize = (): void => {
      state.stop = null;

      const pixels = pickPixelsToSend(state.sent, readScreenPixels());

      if (pixels !== null) {
        state.sent = pixels;
        void writeResize(nixie.client, pixels);
      }
    };

    const handleResize = (): void => {
      state.stop ??= startPlatformTimer(sendSize, resizeDelayMs);
    };

    globalThis.addEventListener('resize', handleResize);

    return () => {
      globalThis.removeEventListener('resize', handleResize);
      state.stop?.();
    };
  }, [isActive, nixie.client]);
}

async function writeResize(client: ContractClient, pixels: ScreenPixels): Promise<void> {
  try {
    await client.devices.resize(pixels);
  } catch {
    // a failed call leaves the next stream to send the size again
  }
}
