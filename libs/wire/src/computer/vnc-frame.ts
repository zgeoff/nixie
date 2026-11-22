// The most bytes of VNC data that one frame carries. A longer chunk is split across frames.
export const vncChunkLimitBytes = 64 * 1024;

// The frames of a VNC stream, which share the computer guest's wire with its requests. The server
// opens a stream and either side closes it. Data runs both ways, as the bytes of the RFB protocol.
export type VNCFrame =
  | { readonly kind: 'vnc-open'; readonly stream: string }
  | { readonly kind: 'vnc-data'; readonly stream: string; readonly data: Uint8Array<ArrayBuffer> }
  | { readonly kind: 'vnc-close'; readonly stream: string };
