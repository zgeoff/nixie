import type { GuestFrame } from './guest-frame';
import type { HostFrame } from './host-frame';

const encoder = new TextEncoder();

// Encodes a turn frame as the JSON bytes of one framed message.
export function encodeTurnFrame(frame: GuestFrame | HostFrame): Uint8Array<ArrayBuffer> {
  return encoder.encode(JSON.stringify(frame));
}
