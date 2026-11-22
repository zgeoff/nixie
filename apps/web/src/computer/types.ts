export interface ViewerEvents {
  // the viewer finished the handshake and the desktop is on screen
  readonly onConnect: () => void;

  // the viewer lost the desktop, or the server closed the stream
  readonly onDisconnect: () => void;
}

// Starts a viewer that draws the socket's desktop into the element, view only. It returns the
// function that stops the viewer. It runs in the same turn as the socket's creation, so the viewer
// hears the first bytes the server sends.
export type StartViewer = (
  target: HTMLElement,
  socket: WebSocket,
  events: ViewerEvents,
) => () => void;

// Loads the viewer's code, which the page does before it opens the socket.
export type LoadViewer = () => Promise<StartViewer>;

export type WatchState =
  | { readonly kind: 'connecting' }

  // the socket is open and the desktop has sent nothing yet, as while the sandbox wakes
  | { readonly kind: 'waking' }
  | { readonly kind: 'watching' }
  | { readonly kind: 'ended' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed' };
