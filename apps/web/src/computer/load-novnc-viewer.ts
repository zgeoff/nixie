import type { StartViewer, ViewerEvents } from './types';
import { waitForFrame } from './wait-for-frame';

// noVNC reads the window when it loads, so the page loads it in the browser alone. The viewer is
// view only: it sends no key, pointer or clipboard message, and the server drops any that arrive.
export async function loadNoVNCViewer(): Promise<StartViewer> {
  const novnc = await import('@novnc/novnc');

  const RFB = novnc.default;

  return (target: HTMLElement, socket: WebSocket, events: ViewerEvents) => {
    const viewer = new RFB(target, socket, { shared: true });

    viewer.viewOnly = true;
    viewer.scaleViewport = true;
    viewer.clipViewport = false;
    viewer.resizeSession = false;
    viewer.focusOnClick = false;
    viewer.background = 'transparent';

    const frame: { stop: (() => void) | null } = { stop: null };

    // the handshake ends before the desktop draws, so the page waits for a picture
    const onConnect = (): void => {
      frame.stop = waitForFrame(target, events.onConnect);
    };

    viewer.addEventListener('connect', onConnect);
    viewer.addEventListener('disconnect', events.onDisconnect);

    return () => {
      frame.stop?.();
      viewer.removeEventListener('connect', onConnect);
      viewer.removeEventListener('disconnect', events.onDisconnect);
      viewer.disconnect();
    };
  };
}
