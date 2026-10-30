export interface StubEndlessBody {
  stream: ReadableStream<Uint8Array>;
  // how many chunks the reader has pulled so far
  countPulls: () => number;
  // the reason of each cancel, in order
  cancels: unknown[];
}

// Stands in for a sender whose request body never ends: each pull gets the given chunk. It counts
// the pulls and records each cancel, so a test sees how soon its reader stopped.
export function buildStubEndlessBody(chunk: Uint8Array): StubEndlessBody {
  let pulls = 0;
  const cancels: unknown[] = [];
  const stream = new ReadableStream<Uint8Array>({
    pull: (controller) => {
      pulls += 1;
      controller.enqueue(chunk);
    },
    cancel: (reason) => void cancels.push(reason),
  });

  return { stream, countPulls: () => pulls, cancels };
}
