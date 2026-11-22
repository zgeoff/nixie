export interface ViewerEvents {
  // the viewer finished the handshake and the desktop is on screen
  readonly onConnect: () => void;

  // the viewer lost the desktop, or the server closed the stream
  readonly onDisconnect: () => void;
}

// Starts a viewer that draws the socket's desktop into the element, view only. It returns the
// function that stops the viewer.
export type StartViewer = (
  target: HTMLElement,
  socket: WebSocket,
  events: ViewerEvents,
) => Promise<() => void>;

export type WatchState =
  | { readonly kind: 'connecting' }

  // the socket is open and the desktop has sent nothing yet, as while the sandbox wakes
  | { readonly kind: 'waking' }
  | { readonly kind: 'watching' }
  | { readonly kind: 'ended' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'failed' };
