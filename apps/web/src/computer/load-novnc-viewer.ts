import type { StartViewer, ViewerEvents } from './types';
import { waitForFrame } from './wait-for-frame';

const controlKeysym = 0xff_e3;
const vKeysym = 0x76;

// noVNC reads the window when it loads, so the page loads it in the browser alone. The viewer is
// view only until the page turns input on, which it does while this device holds the desktop. It
// sends clipboard text only for a paste, and the server drops it unless this device holds.
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

    const onClipboard = (event: Event): void => {
      if (event instanceof CustomEvent && typeof event.detail?.text === 'string') {
        events.onCopy(event.detail.text);
      }
    };

    viewer.addEventListener('clipboard', onClipboard);

    return {
      paste: (text) => {
        viewer.clipboardPasteFrom(text);
        viewer.sendKey(controlKeysym, 'ControlLeft', true);
        viewer.sendKey(vKeysym, 'KeyV');
        viewer.sendKey(controlKeysym, 'ControlLeft', false);
      },
      setInput: (isOn) => {
        viewer.viewOnly = !isOn;
        viewer.focusOnClick = isOn;

        if (isOn) {
          viewer.focus();
        } else {
          viewer.blur();
        }
      },
      stop: () => {
        frame.stop?.();
        viewer.removeEventListener('connect', onConnect);
        viewer.removeEventListener('disconnect', events.onDisconnect);
        viewer.removeEventListener('clipboard', onClipboard);
        viewer.disconnect();
      },
    };
  };
}
