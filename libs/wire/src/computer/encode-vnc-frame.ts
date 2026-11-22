import type { VNCFrame } from './vnc-frame';

const encoder = new TextEncoder();

// The kind comes first in the text, so a reader tells a VNC frame from a request without parsing it.
export function encodeVNCFrame(frame: VNCFrame): Uint8Array<ArrayBuffer> {
  const message =
    frame.kind === 'vnc-data'
      ? { kind: frame.kind, stream: frame.stream, data: Buffer.from(frame.data).toString('base64') }
      : { kind: frame.kind, stream: frame.stream };

  return encoder.encode(JSON.stringify(message));
}
