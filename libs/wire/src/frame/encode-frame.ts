import { frameHeaderBytes } from './frame-header-bytes';

export function encodeFrame(message: Uint8Array): Uint8Array<ArrayBuffer> {
  const frame = new Uint8Array(frameHeaderBytes + message.byteLength);

  new DataView(frame.buffer).setUint32(0, message.byteLength);

  frame.set(message, frameHeaderBytes);

  return frame;
}
