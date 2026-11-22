// What a watch needs from the viewer's socket.
export interface WatchSocket {
  readonly send: (bytes: Uint8Array) => void;

  // closes the socket; the watch calls it when the stream ends or the viewer breaks the protocol
  readonly close: () => void;
}

// The watch as the socket's owner drives it.
export interface WatchConnection {
  // the viewer's bytes, as the socket received them
  readonly receive: (bytes: Uint8Array) => void;

  // Drops the viewer's key and pointer messages still queued in the server and the guest, and
  // releases each key and button that the viewer's input left pressed. The hold of the viewer's
  // device has ended, so none of its input passes after this.
  readonly releaseInput: () => void;

  // The socket closed or its session ended. Frames stop, and the watch releases the sandbox. Safe to
  // call more than once.
  readonly end: () => void;
}

// What a watch asks of the hold on the desktop.
export interface WatchInput {
  // whether this viewer's device holds the desktop now
  readonly canInput: () => boolean;

  // called when a key or pointer message from the viewer passes on to the VNC server
  readonly onInput: () => void;
}
