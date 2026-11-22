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
  inFlight: ScreenPixels | null;
}

// Tells the server the new size of the screen after the window resizes: at most one call every
// 250 ms, and none when the size is what the server has. A failed resize leaves the ref as it was,
// so the next resize event sends the size again.
export function useScreenResize(isActive: boolean, serverPixels: RefObject<ScreenPixels>): void {
  const nixie = useNixieClient();

  useEffect(() => {
    if (!isActive) {
      return () => {};
    }

    const state: ResizeState = { stop: null, inFlight: null };

    const sendSize = (): void => {
      state.stop = null;

      const pixels = pickPixelsToSend(state.inFlight ?? serverPixels.current, readScreenPixels());

      if (pixels !== null) {
        void writeResize(nixie.client, pixels, state, serverPixels);
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
  }, [isActive, nixie.client, serverPixels]);
}

async function writeResize(
  client: ContractClient,
  pixels: ScreenPixels,
  state: ResizeState,
  serverPixels: RefObject<ScreenPixels>,
): Promise<void> {
  state.inFlight = pixels;

  try {
    await client.devices.resize(pixels);

    serverPixels.current = pixels;
  } catch {
    // the server keeps its old size, so the next resize event sends the size again
  } finally {
    state.inFlight = null;
  }
}
