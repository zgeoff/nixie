import type { GuestFrame } from './guest-frame';

const encoder = new TextEncoder();

export function encodeTurnFrame(frame: GuestFrame): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(frame));
}
