import type { GuestFrame } from './guest-frame';
import type { HostFrame } from './host-frame';

const encoder = new TextEncoder();

export function encodeTurnFrame(frame: GuestFrame | HostFrame): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(frame));
}
