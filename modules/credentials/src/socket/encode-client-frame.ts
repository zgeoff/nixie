import { randomBytes } from 'node:crypto';

export type FrameOpcode = 0x1 | 0x8 | 0x9 | 0xa;

// One whole, masked frame of a client, as RFC 6455 requires of every client frame.
export function encodeClientFrame(opcode: FrameOpcode, payload: Uint8Array): Buffer {
  const size = payload.length;
  const lengthBytes = countLengthBytes(size);
  const mask = randomBytes(4);
  const frame = Buffer.alloc(2 + lengthBytes + 4 + size);

  frame[0] = 0x80 | opcode;

  if (lengthBytes === 0) {
    frame[1] = 0x80 | size;
  } else if (lengthBytes === 2) {
    frame[1] = 0x80 | 126;

    frame.writeUInt16BE(size, 2);
  } else {
    frame[1] = 0x80 | 127;

    frame.writeBigUInt64BE(BigInt(size), 2);
  }

  mask.copy(frame, 2 + lengthBytes);

  for (let index = 0; index < size; index += 1) {
    frame[6 + lengthBytes + index] = (payload[index] ?? 0) ^ (mask[index % 4] ?? 0);
  }

  return frame;
}

function countLengthBytes(size: number): number {
  if (size < 126) {
    return 0;
  }

  return size < 65_536 ? 2 : 8;
}
