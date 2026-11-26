import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { startPlatformTimer } from '../utils/start-platform-timer';
import type { DeviceChannel } from './hold-device-stream-as-leader';
import { holdDeviceStreamAsLeader } from './hold-device-stream-as-leader';
import { useDeviceFeed } from './use-device-feed';

export function DeviceLeaderConnection(): ReactNode {
  const feed = useDeviceFeed();

  useEffect(() => {
    const hasChannel = typeof BroadcastChannel === 'function';

    const stop = holdDeviceStreamAsLeader(feed, {
      tab: crypto.randomUUID(),
      locks: globalThis.navigator.locks,
      openChannel: hasChannel ? openBroadcastChannel : null,
      startTimer: startPlatformTimer,
    });

    // A closed tab runs no effect cleanup, so it hands the stream on as the page goes. A page that
    // the browser keeps to show again keeps its stream.
    const handlePageHide = (event: PageTransitionEvent): void => {
      if (!event.persisted) {
        stop();
      }
    };

    globalThis.addEventListener('pagehide', handlePageHide);

    return () => {
      globalThis.removeEventListener('pagehide', handlePageHide);

      stop();
    };
  }, [feed]);

  return null;
}

function openBroadcastChannel(name: string): DeviceChannel {
  const channel = new BroadcastChannel(name);

  return {
    send: (message) => {
      // oxlint-disable-next-line unicorn/require-post-message-target-origin -- a BroadcastChannel reaches only its own origin and takes no target origin
      channel.postMessage(message);
    },
    listen: (onMessage) => {
      channel.addEventListener('message', (event) => {
        onMessage(event.data);
      });
    },
    close: () => {
      channel.close();
    },
  };
}
