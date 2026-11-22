// One connection to a VNC server: bytes in, and an end that closes it.
export interface VNCLink {
  readonly write: (bytes: Uint8Array) => void;

  // drops the messages written and not yet taken by the VNC server, except one that is half written
  readonly flush: () => void;
  readonly end: () => void;
}

export interface VNCLinkEvents {
  readonly onData: (bytes: Uint8Array) => void;

  // the VNC server closed the connection, or it failed
  readonly onClose: () => void;
}

export type ConnectVNC = (events: VNCLinkEvents) => Promise<VNCLink>;
