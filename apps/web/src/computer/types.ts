export interface ViewerEvents {
  // the viewer finished the handshake and the desktop is on screen
  readonly onConnect: () => void;

  // the viewer lost the desktop, or the server closed the stream
  readonly onDisconnect: () => void;

  // the desktop copied text, which the page passes to the user's clipboard only while the user holds it
  readonly onCopy: (text: string) => void;
}

export interface Viewer {
  readonly stop: () => void;

  // Lets the viewer send the keys and pointer of the person, or stops it. The server passes them
  // only while this device holds the desktop.
  readonly setInput: (isOn: boolean) => void;

  // Sets the desktop's clipboard to the text and presses the paste chord there, so the text lands in
  // the field in focus.
  readonly paste: (text: string) => void;
}

// Starts a viewer that draws the socket's desktop into the element, view only until `setInput` turns
// input on. It runs in the same turn as the socket's creation, so the viewer hears the first bytes
// the server sends.
export type StartViewer = (target: HTMLElement, socket: WebSocket, events: ViewerEvents) => Viewer;

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
