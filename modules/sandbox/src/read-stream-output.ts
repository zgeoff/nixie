import type { CollectedOutput } from './types';

// The read drains the stream past limitBytes, because a runtime can stall a command whose output
// nobody reads.
export async function readStreamOutput(
  stream: ReadableStream<Uint8Array>,
  limitBytes: number,
): Promise<CollectedOutput> {
  const kept = new Uint8Array(limitBytes);

  const counts = { kept: 0, total: 0 };

  for await (const chunk of stream) {
    const slice = chunk.subarray(0, Math.max(0, limitBytes - counts.kept));

    kept.set(slice, counts.kept);

    counts.kept += slice.byteLength;
    counts.total += chunk.byteLength;
  }

  return {
    bytes: kept.slice(0, counts.kept),
    totalBytes: counts.total,
    isCut: counts.total > counts.kept,
  };
}
