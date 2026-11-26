import { startPlatformTimer } from '../utils/start-platform-timer';
import type { DeviceFeed } from './create-device-feed';
import type { DeviceChannel } from './hold-device-stream-as-leader';
import { holdDeviceStreamAsLeader } from './hold-device-stream-as-leader';

// Takes part in the choice of the tab that holds the device stream, with the browser's own lock
// manager and channel, until the returned function runs or the tab closes.
export function holdDeviceStreamInBrowser(feed: DeviceFeed): () => void {
  const hasChannel = typeof BroadcastChannel === 'function';

  const stop = holdDeviceStreamAsLeader(feed, {
    tab: crypto.randomUUID(),
    locks: globalThis.navigator.locks,
    openChannel: hasChannel ? openBroadcastChannel : null,
    startTimer: startPlatformTimer,
  });

  // A closed tab runs no cleanup, so it hands the stream on as the page goes. A page that the
  // browser keeps to show again keeps its stream.
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
