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

  // The socket closed or its session ended. Frames stop, and the watch releases the sandbox. Safe to
  // call more than once.
  readonly end: () => void;
}
