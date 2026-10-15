export interface StubPoolWork {
  // the work not yet claimed, in claim order; a test pushes to it to make more work claimable
  readonly queue: string[];

  // the runs in flight, each held until released
  readonly running: ReadonlyMap<string, () => void>;
  readonly finished: readonly string[];

  // the most runs in flight at once
  readonly peak: { readonly running: number };
  readonly claim: () => Promise<string | null>;
  readonly run: (item: string) => Promise<void>;

  // releases every run in flight
  readonly releaseAll: () => void;
}

// Builds the work source and the runner a runner pool drives: a claim takes the next queued item,
// or finds none, and each run holds until the test releases it, so a test sees what runs at once.
export function buildStubPoolWork(work: readonly string[]): StubPoolWork {
  const queue = [...work];

  const running = new Map<string, () => void>();

  const finished: string[] = [];
  const peak = { running: 0 };

  return {
    queue,
    running,
    finished,
    peak,
    claim: () => Promise.resolve(queue.shift() ?? null),
    run: async (item) => {
      const held = Promise.withResolvers<void>();

      running.set(item, held.resolve);

      peak.running = Math.max(peak.running, running.size);

      await held.promise;

      running.delete(item);
      finished.push(item);
    },
    releaseAll: () => {
      for (const release of running.values()) {
        release();
      }
    },
  };
}
