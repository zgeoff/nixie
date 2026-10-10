import { frameHeaderBytes } from './frame-header-bytes';

// Encodes one message as a frame: its 4-byte length, then its bytes. A stream of frames keeps each
// message whole however the transport splits or joins the bytes.
export function encodeFrame(message: Uint8Array): Uint8Array<ArrayBuffer> {
  const frame = new Uint8Array(frameHeaderBytes + message.byteLength);

  new DataView(frame.buffer).setUint32(0, message.byteLength);
  frame.set(message, frameHeaderBytes);
  return frame;
}
