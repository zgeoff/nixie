export interface CappedOutput {
  readonly text: string;
  readonly isCut: boolean;
}

// Reads the stream to its end and keeps the first `limitBytes` of it, so a command that writes
// without end fills no memory and never blocks on a full pipe.
export async function readCappedOutput(
  stream: ReadableStream<Uint8Array>,
  limitBytes: number,
): Promise<CappedOutput> {
  const kept: Uint8Array[] = [];
  let keptBytes = 0;
  let isCut = false;

  for await (const chunk of stream) {
    const room = limitBytes - keptBytes;

    if (chunk.byteLength > room) {
      isCut = true;
    }

    if (room > 0) {
      kept.push(chunk.subarray(0, room));

      keptBytes += Math.min(room, chunk.byteLength);
    }
  }

  return { text: new TextDecoder().decode(Buffer.concat(kept)), isCut };
}
