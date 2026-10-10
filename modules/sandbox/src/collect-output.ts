import type { CollectedOutput } from './types';

// Reads a stream to its end and keeps its first limitBytes. It reads past the limit and drops the
// rest, so a runtime that ends a command whose output nobody reads never sees an unread stream.
export async function collectOutput(
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
