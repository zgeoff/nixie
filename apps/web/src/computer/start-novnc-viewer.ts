import type { ViewerEvents } from './types';

// noVNC reads the window when it loads, so the page loads it in the browser alone. The viewer is
// view only: it sends no key, pointer or clipboard message, and the server drops any that arrive.
export async function startNoVNCViewer(
  target: HTMLElement,
  socket: WebSocket,
  events: ViewerEvents,
): Promise<() => void> {
  const novnc = await import('@novnc/novnc');

  const RFB = novnc.default;

  const viewer = new RFB(target, socket, { shared: true });

  viewer.viewOnly = true;
  viewer.scaleViewport = true;
  viewer.clipViewport = false;
  viewer.resizeSession = false;
  viewer.focusOnClick = false;
  viewer.background = 'transparent';

  viewer.addEventListener('connect', events.onConnect);
  viewer.addEventListener('disconnect', events.onDisconnect);

  return () => {
    viewer.removeEventListener('connect', events.onConnect);
    viewer.removeEventListener('disconnect', events.onDisconnect);
    viewer.disconnect();
  };
}
