export interface ServerFrame {
  readonly opcode: number;
  readonly isFinal: boolean;
  readonly payload: Buffer;
}

// Reads the frames of a server from the chunks of its connection, in order. A frame that is split
// across chunks waits for the rest. A frame past `maxBytes`, or one that a server masks, throws.
export function makeFrameReader(maxBytes: number): (chunk: Uint8Array) => ServerFrame[] {
  let pending = Buffer.alloc(0);

  return (chunk) => {
    pending = Buffer.concat([pending, chunk]);

    const frames: ServerFrame[] = [];

    for (;;) {
      const read = readFrame(pending, maxBytes);

      if (read === null) {
        return frames;
      }

      frames.push(read.frame);

      pending = pending.subarray(read.used);
    }
  };
}

function readFrame(
  bytes: Buffer,
  maxBytes: number,
): { readonly frame: ServerFrame; readonly used: number } | null {
  if (bytes.length < 2) {
    return null;
  }

  const first = bytes[0] ?? 0;
  const second = bytes[1] ?? 0;

  if ((second & 0x80) !== 0) {
    throw new Error('the server sent a masked frame');
  }

  const short = second & 0x7f;
  const lengthBytes = countLengthBytes(short);

  if (bytes.length < 2 + lengthBytes) {
    return null;
  }

  const size = readSize(bytes, short, lengthBytes);

  if (size > maxBytes) {
    throw new Error(`the server sent a frame of ${String(size)} bytes, past ${String(maxBytes)}`);
  }

  const start = 2 + lengthBytes;

  if (bytes.length < start + size) {
    return null;
  }

  return {
    frame: {
      opcode: first & 0x0f,
      isFinal: (first & 0x80) !== 0,
      payload: Buffer.from(bytes.subarray(start, start + size)),
    },
    used: start + size,
  };
}

function countLengthBytes(short: number): number {
  if (short < 126) {
    return 0;
  }

  return short === 126 ? 2 : 8;
}

function readSize(bytes: Buffer, short: number, lengthBytes: number): number {
  if (lengthBytes === 0) {
    return short;
  }

  if (lengthBytes === 2) {
    return bytes.readUInt16BE(2);
  }

  const big = bytes.readBigUInt64BE(2);

  return big > BigInt(Number.MAX_SAFE_INTEGER) ? Number.MAX_SAFE_INTEGER : Number(big);
}
