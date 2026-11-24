import type { ContractClient } from '@heynixie/contract';
import { useEffect } from 'react';
import type { StartTimer } from '../utils/start-platform-timer';
import { startPlatformTimer } from '../utils/start-platform-timer';
import { useNixieClient } from '../utils/use-nixie-client';

// The beat of a visible client, which the API keeps as presence.
export const shownBeatMs = 60_000;

// Calls sessions.shown when the page becomes visible and each minute while it stays visible. A
// background tab never calls it, however long its stream stays open.
export function useShownBeat(startTimer: StartTimer = startPlatformTimer): void {
  const client = useNixieClient().client;

  useEffect(() => {
    const beat = { stop: (): void => {}, isStopped: false };

    const send = (): void => {
      void sendShown(client);
    };

    const arm = (): void => {
      beat.stop();

      if (beat.isStopped || globalThis.document.visibilityState !== 'visible') {
        return;
      }

      beat.stop = startTimer(() => {
        send();
        arm();
      }, shownBeatMs);
    };

    const handleVisibility = (): void => {
      if (globalThis.document.visibilityState === 'visible') {
        send();
      }

      arm();
    };

    if (globalThis.document.visibilityState === 'visible') {
      send();
    }

    arm();

    globalThis.document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      beat.isStopped = true;

      beat.stop();
      globalThis.document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [client, startTimer]);
}

// A beat that fails is lost, and the next one follows within a minute.
async function sendShown(client: ContractClient): Promise<void> {
  try {
    await client.sessions.shown({});
  } catch {
    // the next beat follows
  }
}
