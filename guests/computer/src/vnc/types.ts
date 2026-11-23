// One connection to a VNC server: bytes in, and an end that closes it.
export interface VNCLink {
  readonly write: (bytes: Uint8Array) => void;

  // Drops the key and pointer messages not yet taken by the VNC server, except one that is half
  // written, and releases the keys and buttons it holds pressed. Other messages stay.
  readonly flush: () => void;
  readonly end: () => void;
}

export interface VNCLinkEvents {
  readonly onData: (bytes: Uint8Array) => void;

  // the VNC server closed the connection, or it failed
  readonly onClose: () => void;
}

export type ConnectVNC = (events: VNCLinkEvents) => Promise<VNCLink>;
